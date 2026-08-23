import test from 'node:test';
import assert from 'node:assert/strict';
import { generateOAuthState, verifyOAuthState } from '../src/lib/calendar/googleOAuthService';
import { encryptToken, decryptToken } from '../src/lib/security/crypto';
import { GET as getStatusRoute } from '../src/app/api/integrations/google-calendar/status/route';
import { POST as disconnectRoute } from '../src/app/api/integrations/google-calendar/disconnect/route';
import { registerUser } from '../src/lib/auth/service';
import { createSessionToken } from '../src/lib/auth/session';
import { prisma } from '../src/lib/prisma';
import { Role } from '../src/lib/types';

test('OAuth State Generation & Signature Verification', async (t) => {
  await t.test('generates valid signed state and verifies successfully', () => {
    const userId = 'user_test_123';
    const returnUrl = '/settings';
    const stateStr = generateOAuthState(userId, returnUrl);

    assert.ok(stateStr);
    const verified = verifyOAuthState(stateStr);
    assert.ok(verified);
    assert.equal(verified?.userId, userId);
    assert.equal(verified?.returnUrl, returnUrl);
  });

  await t.test('rejects tampered state string', () => {
    const userId = 'user_test_123';
    const stateStr = generateOAuthState(userId, '/settings');
    const tampered = stateStr.slice(0, -4) + 'abcd';

    const verified = verifyOAuthState(tampered);
    assert.equal(verified, null);
  });
});

test('Token AES-256-GCM Encryption & Decryption At Rest', async (t) => {
  await t.test('encrypts and decrypts OAuth tokens round-trip', () => {
    const rawAccessToken = 'ya29.a0ARW5m7M_mock_access_token_value_12345';
    const encrypted = encryptToken(rawAccessToken);

    assert.ok(encrypted);
    assert.notEqual(encrypted, rawAccessToken);
    assert.ok(encrypted.includes(':')); // Format: iv:authTag:data

    const decrypted = decryptToken(encrypted);
    assert.equal(decrypted, rawAccessToken);
  });
});

test('Google Calendar Integration Status API & Disconnect Endpoint', async (t) => {
  let userToken: string;
  let userId: string;

  t.before(async () => {
    const email = `oauth.test.${Date.now()}@carepulse.com`;
    const user = await registerUser(email, 'Password123!', 'OAuth Test User', Role.PATIENT, true);
    userId = user.id;
    userToken = createSessionToken({ userId: user.id, email: user.email, name: user.name, role: user.role });
  });

  t.after(async () => {
    await prisma.googleCalendarConnection.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  });

  await t.test('GET /api/integrations/google-calendar/status returns NOT_CONNECTED for new user', async () => {
    const req = new Request('http://localhost:3000/api/integrations/google-calendar/status', {
      headers: { Cookie: `carepulse_session=${userToken}` },
    });

    const res = await getStatusRoute(req);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.isConnected, false);
    assert.equal(body.status, 'NOT_CONNECTED');
  });

  await t.test('POST /api/integrations/google-calendar/disconnect deactivates connection', async () => {
    // Create a mock connection in database
    await prisma.googleCalendarConnection.create({
      data: {
        userId,
        provider: 'google',
        providerAccountEmail: 'test.user@gmail.com',
        encryptedAccessToken: encryptToken('access_token_sample'),
        encryptedRefreshToken: encryptToken('refresh_token_sample'),
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
        scopes: 'https://www.googleapis.com/auth/calendar.events',
        status: 'CONNECTED',
      },
    });

    const req = new Request('http://localhost:3000/api/integrations/google-calendar/disconnect', {
      method: 'POST',
      headers: { Cookie: `carepulse_session=${userToken}` },
    });

    const res = await disconnectRoute(req);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);

    const updatedConn = await prisma.googleCalendarConnection.findUnique({
      where: { userId_provider: { userId, provider: 'google' } },
    });

    assert.equal(updatedConn?.status, 'DISCONNECTED');
  });
});
