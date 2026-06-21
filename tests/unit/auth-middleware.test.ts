import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

type EnvOverride = Record<string, string | undefined>;

const validProductionEnv: EnvOverride = {
  NODE_ENV: 'production',
  DEV_AUTH_ENABLED: 'false',
  DATABASE_URL: 'postgres://mydream:mydream@localhost:5433/mydream',
  OPENROUTER_API_KEY: 'openrouter-key',
  CORS_ALLOWED_ORIGINS: 'https://app.mydream.local',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'https://api.example.com',
  GOOGLE_WEB_CLIENT_ID: 'g-web',
  GOOGLE_IOS_CLIENT_ID: 'g-ios',
  GOOGLE_ANDROID_CLIENT_ID: 'g-and',
  GOOGLE_WEB_CLIENT_SECRET: 'g-sec',
  APPLE_SERVICE_ID: 'a-svc',
  APPLE_APP_BUNDLE_IDENTIFIER: 'a-bundle',
  APPLE_TEAM_ID: 'a-team',
  APPLE_KEY_ID: 'a-key',
  APPLE_PRIVATE_KEY: 'a-pk',
};

type FakeSession = { user: { id: string } } | null;

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

/**
 * Builds an app whose only route is protected by the middleware, with the Better
 * Auth module mocked so `getSession` returns the supplied session. Re-imports
 * under the given env so config (DEV_AUTH_ENABLED, prod validation) is re-parsed.
 */
async function createProtectedApp(overrides: EnvOverride, session: FakeSession = null) {
  vi.resetModules();
  setEnv(overrides);

  const getSession = vi.fn().mockResolvedValue(session);
  vi.doMock('../../src/auth/auth', () => ({ auth: { api: { getSession }, handler: vi.fn() } }));

  const [{ authMiddleware }, { errorHandler }] = await Promise.all([
    import('../../src/middlewares/authMiddleware'),
    import('../../src/middlewares/errorHandler'),
  ]);
  const app = new Hono();

  app.onError(errorHandler);
  app.get('/protected', authMiddleware, (c) => c.json({ success: true, userId: c.get('userId') }));

  return { app, getSession };
}

describe('authMiddleware', () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
    vi.doUnmock('../../src/auth/auth');
  });

  it('accepts X-Dev-User-Id only when dev auth is enabled in development', async () => {
    const userId = crypto.randomUUID();
    const { app } = await createProtectedApp({ NODE_ENV: 'development', DEV_AUTH_ENABLED: 'true' });

    const response = await app.request('/protected', { headers: { 'X-Dev-User-Id': userId } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, userId });
  });

  it('accepts X-Dev-User-Id when dev auth is enabled in test', async () => {
    const userId = crypto.randomUUID();
    const { app } = await createProtectedApp({ NODE_ENV: 'test', DEV_AUTH_ENABLED: 'true' });

    const response = await app.request('/protected', { headers: { 'X-Dev-User-Id': userId } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, userId });
  });

  it('rejects production startup when dev auth is enabled', async () => {
    await expect(
      createProtectedApp({ ...validProductionEnv, DEV_AUTH_ENABLED: 'true' }),
    ).rejects.toThrow(/DEV_AUTH_ENABLED must not be true in production/);
  });

  it('ignores X-Dev-User-Id in production and falls through to the session check', async () => {
    const { app, getSession } = await createProtectedApp(validProductionEnv, null);

    const response = await app.request('/protected', { headers: { 'X-Dev-User-Id': crypto.randomUUID() } });

    expect(response.status).toBe(401);
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(await response.json()).toEqual({
      success: false,
      error: { code: 'UNAUTHORIZED', message: expect.any(String) },
    });
  });

  it('rejects X-Dev-User-Id when dev auth is disabled in development', async () => {
    const { app } = await createProtectedApp({ NODE_ENV: 'development', DEV_AUTH_ENABLED: 'false' }, null);

    const response = await app.request('/protected', { headers: { 'X-Dev-User-Id': crypto.randomUUID() } });

    expect(response.status).toBe(401);
  });

  it('resolves the user id from a valid Better Auth session', async () => {
    const userId = crypto.randomUUID();
    const { app, getSession } = await createProtectedApp(
      { NODE_ENV: 'development', DEV_AUTH_ENABLED: 'false' },
      { user: { id: userId } },
    );

    const response = await app.request('/protected');

    expect(getSession).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, userId });
  });

  it('returns 401 when there is no session', async () => {
    const { app } = await createProtectedApp({ NODE_ENV: 'development', DEV_AUTH_ENABLED: 'false' }, null);

    const response = await app.request('/protected');

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      error: { code: 'UNAUTHORIZED', message: expect.any(String) },
    });
  });
});
