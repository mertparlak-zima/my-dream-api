import { Hono } from 'hono';
import { SignJWT } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

type EnvOverride = Record<string, string | undefined>;

const validProductionEnv: EnvOverride = {
  NODE_ENV: 'production',
  DEV_AUTH_ENABLED: 'false',
  DATABASE_URL: 'postgres://mydream:mydream@localhost:5433/mydream',
  SUPABASE_URL: 'https://project.supabase.co',
  OPENROUTER_API_KEY: 'openrouter-key',
  CORS_ALLOWED_ORIGINS: 'https://app.mydream.local',
  RATE_LIMIT_WINDOW_MS: '60000',
  RATE_LIMIT_MAX_REQUESTS: '120',
};

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }

  Object.assign(process.env, originalEnv);
}

function setEnv(overrides: EnvOverride): void {
  restoreEnv();

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function createProtectedApp(overrides: EnvOverride) {
  vi.resetModules();
  setEnv(overrides);

  const [{ authMiddleware }, { errorHandler }] = await Promise.all([
    import('../../src/middlewares/authMiddleware'),
    import('../../src/middlewares/errorHandler'),
  ]);
  const app = new Hono();

  app.onError(errorHandler);
  app.get('/protected', authMiddleware, (c) => {
    return c.json({ success: true, userId: c.get('userId') });
  });

  return app;
}

async function signTestJwt(userId: string, secret: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(new TextEncoder().encode(secret));
}

describe('authMiddleware', () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  it('accepts X-Dev-User-Id only when dev auth is enabled in development', async () => {
    const userId = crypto.randomUUID();
    const app = await createProtectedApp({
      NODE_ENV: 'development',
      DEV_AUTH_ENABLED: 'true',
      JWT_SECRET: undefined,
      SUPABASE_URL: undefined,
    });

    const response = await app.request('/protected', {
      headers: { 'X-Dev-User-Id': userId },
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, userId });
  });

  it('accepts X-Dev-User-Id when dev auth is enabled in test', async () => {
    const userId = crypto.randomUUID();
    const app = await createProtectedApp({
      NODE_ENV: 'test',
      DEV_AUTH_ENABLED: 'true',
      JWT_SECRET: undefined,
      SUPABASE_URL: undefined,
    });

    const response = await app.request('/protected', {
      headers: { 'X-Dev-User-Id': userId },
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, userId });
  });

  it('rejects production startup when dev auth is enabled', async () => {
    await expect(createProtectedApp({
      ...validProductionEnv,
      DEV_AUTH_ENABLED: 'true',
      JWT_SECRET: 'unit-test-jwt-secret',
    })).rejects.toThrow(/DEV_AUTH_ENABLED must not be true in production/);
  });

  it('rejects X-Dev-User-Id in production when dev auth is disabled', async () => {
    const app = await createProtectedApp({
      ...validProductionEnv,
      JWT_SECRET: 'unit-test-jwt-secret',
    });

    const response = await app.request('/protected', {
      headers: { 'X-Dev-User-Id': crypto.randomUUID() },
    });
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: expect.any(String),
      },
    });
  });

  it('rejects X-Dev-User-Id when dev auth is disabled', async () => {
    const app = await createProtectedApp({
      NODE_ENV: 'development',
      DEV_AUTH_ENABLED: 'false',
      JWT_SECRET: undefined,
      SUPABASE_URL: undefined,
    });

    const response = await app.request('/protected', {
      headers: { 'X-Dev-User-Id': crypto.randomUUID() },
    });
    const json = await response.json();

    expect(response.status).toBe(401);
    expect(json).toEqual({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: expect.any(String),
      },
    });
  });

  it('accepts a bearer token signed with the configured JWT secret', async () => {
    const userId = crypto.randomUUID();
    const jwtSecret = 'unit-test-jwt-secret';
    const token = await signTestJwt(userId, jwtSecret);
    const app = await createProtectedApp({
      ...validProductionEnv,
      JWT_SECRET: jwtSecret,
    });

    const response = await app.request('/protected', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, userId });
  });
});
