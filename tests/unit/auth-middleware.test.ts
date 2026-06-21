import { Hono } from 'hono';
import { createServer } from 'node:http';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
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
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'https://api.example.com',
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

async function startJwksServer(publicKey: CryptoKey): Promise<{
  close: () => Promise<void>;
  jwksUrl: string;
}> {
  const jwk = await exportJWK(publicKey);
  jwk.use = 'sig';
  jwk.alg = 'ES256';
  jwk.kid = 'test-es256-key';

  const server = createServer((_, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw new Error('Failed to start JWKS test server');
  }

  return {
    jwksUrl: `http://127.0.0.1:${address.port}/.well-known/jwks.json`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
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

  it('verifies Supabase ES256 tokens through JWKS even when a JWT secret exists', async () => {
    const userId = crypto.randomUUID();
    const { publicKey, privateKey } = await generateKeyPair('ES256');
    const jwksServer = await startJwksServer(publicKey);

    try {
      const token = await new SignJWT({})
        .setProtectedHeader({ alg: 'ES256', kid: 'test-es256-key' })
        .setSubject(userId)
        .setIssuer('https://project.supabase.co/auth/v1')
        .setIssuedAt()
        .setExpirationTime('5m')
        .sign(privateKey);

      const app = await createProtectedApp({
        ...validProductionEnv,
        JWT_SECRET: 'wrong-legacy-secret',
        SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_JWKS_URL: jwksServer.jwksUrl,
        SUPABASE_JWT_ISSUER: 'https://project.supabase.co/auth/v1',
      });

      const response = await app.request('/protected', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({ success: true, userId });
    } finally {
      await jwksServer.close();
    }
  });
});
