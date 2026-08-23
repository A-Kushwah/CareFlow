import test from 'node:test';
import assert from 'node:assert/strict';
import { generateOAuthState, verifyOAuthState, exchangeCodeAndSaveConnection } from '../src/lib/calendar/googleOAuthService';
import { encryptToken, decryptToken } from '../src/lib/security/crypto';
import { GET as getStatusRoute } from '../src/app/api/integrations/google-calendar/status/route';
import { POST as disconnectRoute } from '../src/app/api/integrations/google-calendar/disconnect/route';
import { registerUser } from '../src/lib/auth/service';
import { createSessionToken } from '../src/lib/auth/session';
import { prisma } from '../src/lib/prisma';
import { Role } from '../src/lib/types';

test('OAuth State Generation, Signature & Single-Use Replay Protection', async (t) => {
  await t.test('generates valid signed state and verifies successfully once', async () => {
    const userId = 'user_test_123';
    const returnUrl = '/settings';
    const stateStr = await generateOAuthState(userId, returnUrl);

    assert.ok(stateStr);
    const verified = await verifyOAuthState(stateStr);
    assert.ok(verified);
    assert.equal(verified?.userId, userId);
    assert.equal(verified?.returnUrl, returnUrl);
  });

  await t.test('enforces single-use state protection (blocks replay attacks)', async () => {
    const userId = 'user_test_replay_check';
    const returnUrl = '/settings';
    const stateStr = await generateOAuthState(userId, returnUrl);

    // First use must succeed
    const firstUse = await verifyOAuthState(stateStr);
    assert.ok(firstUse);

    // Second use of the exact same state must be rejected (replay attack)
    const secondUse = await verifyOAuthState(stateStr);
    assert.equal(secondUse, null);
  });

  await t.test('rejects tampered state string', async () => {
    const userId = 'user_test_123';
    const stateStr = await generateOAuthState(userId, '/settings');
    const tampered = stateStr.slice(0, -4) + 'abcd';

    const verified = await verifyOAuthState(tampered);
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

  await t.test('never writes fake fallback tokens to database when refresh token is missing', async () => {
    const email = `no.refresh.${Date.now()}@carepulse.com`;
    const user = await registerUser(email, 'Password123!', 'No Refresh User', Role.PATIENT, true);

    const origClientId = process.env.GOOGLE_CLIENT_ID;
    const origClientSecret = process.env.GOOGLE_CLIENT_SECRET;

    process.env.GOOGLE_CLIENT_ID = 'test_client_id_123';
    process.env.GOOGLE_CLIENT_SECRET = 'test_client_secret_123';

    try {
      // Mock global fetch returning access_token but NO refresh_token
      const origFetch = global.fetch;
      (global as any).fetch = async (url: string) => {
        if (url.includes('oauth2.googleapis.com/token')) {
          return {
            ok: true,
            json: async () => ({
              access_token: 'access_only_token',
              expires_in: 3600,
              // refresh_token intentionally omitted
            }),
          };
        }
        return origFetch(url);
      };

      try {
        await assert.rejects(
          async () => {
            await exchangeCodeAndSaveConnection(user.id, 'auth_code_sample');
          },
          (err: any) => {
            return err.message.includes('Google OAuth did not return a refresh token');
          }
        );

        // Verify NO record with fake fallback token exists in database
        const conn = await prisma.googleCalendarConnection.findUnique({
          where: { userId_provider: { userId: user.id, provider: 'google' } },
        });

        assert.equal(conn, null);
      } finally {
        global.fetch = origFetch;
      }
    } finally {
      process.env.GOOGLE_CLIENT_ID = origClientId;
      process.env.GOOGLE_CLIENT_SECRET = origClientSecret;
      await prisma.user.delete({ where: { id: user.id } });
    }
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
    // Create a valid connection in database
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
