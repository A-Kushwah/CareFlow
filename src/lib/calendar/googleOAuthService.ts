import crypto from 'crypto';
import { prisma } from '../prisma';
import { encryptToken, decryptToken } from '../security/crypto';

const SCOPES = 'https://www.googleapis.com/auth/calendar.events';
const STATE_SECRET = process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.JWT_SECRET || 'carepulse_oauth_state_secret_key';

export function generateOAuthState(userId: string, returnUrl: string = '/settings'): string {
  const timestamp = Date.now();
  const raw = `${userId}:${timestamp}:${returnUrl}`;
  const signature = crypto.createHmac('sha256', STATE_SECRET).update(raw).digest('base64url');
  return Buffer.from(JSON.stringify({ userId, timestamp, returnUrl, sig: signature })).toString('base64url');
}

export function verifyOAuthState(stateString: string): { userId: string; returnUrl: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(stateString, 'base64url').toString('utf8'));
    const { userId, timestamp, returnUrl, sig } = decoded;

    if (!userId || !timestamp || !sig) return null;

    // Reject state older than 15 minutes
    if (Date.now() - timestamp > 15 * 60 * 1000) return null;

    const raw = `${userId}:${timestamp}:${returnUrl || '/settings'}`;
    const expectedSig = crypto.createHmac('sha256', STATE_SECRET).update(raw).digest('base64url');

    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
      return null;
    }

    return { userId, returnUrl: returnUrl || '/settings' };
  } catch {
    return null;
  }
}

export function getGoogleAuthUrl(userId: string, returnUrl: string = '/settings'): string {
  const clientId = process.env.GOOGLE_CLIENT_ID || '';
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || 'http://localhost:3000/api/integrations/google-calendar/callback';
  const state = generateOAuthState(userId, returnUrl);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeAndSaveConnection(userId: string, code: string): Promise<any> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || 'http://localhost:3000/api/integrations/google-calendar/callback';

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured');
  }

  // 1. Exchange Code for Tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_description || tokenData.error || 'Failed to exchange authorization code with Google');
  }

  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;
  const expiresInSec = tokenData.expires_in || 3600;
  const tokenExpiresAt = new Date(Date.now() + (expiresInSec - 60) * 1000);

  // 2. Fetch User Account Email from Google UserInfo API
  let googleEmail = `google.user.${userId}@gmail.com`;
  try {
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (userInfoRes.ok) {
      const userInfo = await userInfoRes.json();
      if (userInfo.email) googleEmail = userInfo.email;
    }
  } catch {
    // Keep fallback
  }

  // 3. Encrypt Tokens at rest
  const encryptedAccessToken = encryptToken(accessToken);
  const existingConn = await prisma.googleCalendarConnection.findUnique({
    where: { userId_provider: { userId, provider: 'google' } },
  });

  const encryptedRefreshToken = refreshToken
    ? encryptToken(refreshToken)
    : (existingConn?.encryptedRefreshToken || encryptToken('mock_refresh_token_fallback'));

  // 4. Save to Database
  const connection = await prisma.googleCalendarConnection.upsert({
    where: { userId_provider: { userId, provider: 'google' } },
    update: {
      providerAccountEmail: googleEmail,
      encryptedAccessToken,
      encryptedRefreshToken,
      tokenExpiresAt,
      scopes: SCOPES,
      status: 'CONNECTED',
      lastError: null,
      updatedAt: new Date(),
    },
    create: {
      userId,
      provider: 'google',
      providerAccountEmail: googleEmail,
      encryptedAccessToken,
      encryptedRefreshToken,
      tokenExpiresAt,
      scopes: SCOPES,
      status: 'CONNECTED',
    },
  });

  return connection;
}

export async function getValidAccessToken(userId: string): Promise<string | null> {
  const conn = await prisma.googleCalendarConnection.findUnique({
    where: { userId_provider: { userId, provider: 'google' } },
  });

  if (!conn || conn.status !== 'CONNECTED') {
    return null;
  }

  // Check if token is still valid (with 5-min buffer)
  if (conn.tokenExpiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
    return decryptToken(conn.encryptedAccessToken);
  }

  // Token is expired or expiring; refresh it using refresh token
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.log(`[GOOGLE OAUTH] Missing OAuth client credentials. Unable to refresh token for user: ${userId}`);
    return null;
  }

  let refreshToken = '';
  try {
    refreshToken = decryptToken(conn.encryptedRefreshToken);
  } catch {
    await prisma.googleCalendarConnection.update({
      where: { id: conn.id },
      data: { status: 'REAUTH_REQUIRED', lastError: 'Failed to decrypt refresh token' },
    });
    return null;
  }

  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.access_token) {
      const errReason = data.error_description || data.error || 'Token refresh failed';

      if (data.error === 'invalid_grant' || data.error === 'unauthorized_client') {
        // Token was revoked or expired permanently; transition to REAUTH_REQUIRED
        await prisma.googleCalendarConnection.update({
          where: { id: conn.id },
          data: { status: 'REAUTH_REQUIRED', lastError: errReason },
        });
      }
      return null;
    }

    const newAccessToken = data.access_token;
    const newEncryptedAccess = encryptToken(newAccessToken);
    const expiresInSec = data.expires_in || 3600;
    const newTokenExpiresAt = new Date(Date.now() + (expiresInSec - 60) * 1000);

    const updateData: any = {
      encryptedAccessToken: newEncryptedAccess,
      tokenExpiresAt: newTokenExpiresAt,
      status: 'CONNECTED',
      lastError: null,
      updatedAt: new Date(),
    };

    if (data.refresh_token) {
      updateData.encryptedRefreshToken = encryptToken(data.refresh_token);
    }

    await prisma.googleCalendarConnection.update({
      where: { id: conn.id },
      data: updateData,
    });

    return newAccessToken;
  } catch (err: any) {
    console.error(`[GOOGLE OAUTH] Network error refreshing token: ${err.message}`);
    return null;
  }
}

export async function disconnectGoogleCalendar(userId: string): Promise<boolean> {
  const conn = await prisma.googleCalendarConnection.findUnique({
    where: { userId_provider: { userId, provider: 'google' } },
  });

  if (!conn) return false;

  // Try revoking token with Google API safely
  try {
    const rawToken = decryptToken(conn.encryptedAccessToken);
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(rawToken)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  } catch {
    // Revocation failure is safe to ignore
  }

  await prisma.googleCalendarConnection.update({
    where: { id: conn.id },
    data: {
      status: 'DISCONNECTED',
      lastError: null,
      updatedAt: new Date(),
    },
  });

  return true;
}
