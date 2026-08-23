import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProductionEnvironment } from '../src/lib/config/productionGuard';
import { verifyPassword, hashPassword } from '../src/lib/auth/service';
import { GET as getHealth } from '../src/app/api/health/route';
import { GET as getHealthIntegrations } from '../src/app/api/health/integrations/route';

test('Production Environment Startup Guard', async (t) => {
  await t.test('passes validation in development environment', () => {
    const result = validateProductionEnvironment();
    assert.equal(result.isProduction, false);
    assert.equal(result.isValid, true);
  });

  await t.test('detects invalid console email provider in production mode', () => {
    const origEnv = process.env.NODE_ENV;
    const origEmail = process.env.EMAIL_PROVIDER;

    try {
      (process.env as any).NODE_ENV = 'production';
      delete process.env.DEVELOPMENT_MODE;
      process.env.EMAIL_PROVIDER = 'console';

      const result = validateProductionEnvironment();
      assert.equal(result.isProduction, true);
      assert.equal(result.isValid, false);
      assert.ok(result.errors.some((e) => e.includes('EMAIL_PROVIDER')));
    } finally {
      (process.env as any).NODE_ENV = origEnv;
      process.env.EMAIL_PROVIDER = origEmail;
    }
  });
});

test('Password Hashing & Security Verification', async (t) => {
  await t.test('verifies PBKDF2 hashed passwords correctly', () => {
    const rawPass = 'SecureHealthcarePass2026!';
    const hash = hashPassword(rawPass);

    assert.equal(verifyPassword(rawPass, hash), true);
    assert.equal(verifyPassword('WrongPassword', hash), false);
  });

  await t.test('rejects bcrypt string bypass in production mode', () => {
    const origEnv = process.env.NODE_ENV;
    try {
      (process.env as any).NODE_ENV = 'production';
      delete process.env.DEVELOPMENT_MODE;

      const dummyBcryptHash = '$2a$10$e.Y0LzU/Y6lJ1f1tVfXy/.4q6P30B4H2s6U6i8N.j5bW0yZ6jWkue';
      const isValidInProd = verifyPassword('admin123', dummyBcryptHash);

      assert.equal(isValidInProd, false);
    } finally {
      (process.env as any).NODE_ENV = origEnv;
    }
  });
});

test('Production System Health Endpoints', async (t) => {
  await t.test('GET /api/health returns system uptime and database status', async () => {
    const res = await getHealth();
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.status, 'OK');
    assert.equal(body.database.status, 'HEALTHY');
    assert.ok(typeof body.uptimeSeconds === 'number');
  });

  await t.test('GET /api/health/integrations returns integration status without leaking secrets', async () => {
    const res = await getHealthIntegrations();
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.ok(body.integrations);
    assert.equal(body.integrations.googleCalendar.mode, 'PER_USER_OAUTH_2.0');

    const jsonStr = JSON.stringify(body);
    assert.equal(jsonStr.includes('client_secret'), false);
    assert.equal(jsonStr.includes('api_key'), false);
    assert.equal(jsonStr.includes('password'), false);
  });
});
