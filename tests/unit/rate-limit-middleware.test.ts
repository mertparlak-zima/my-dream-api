import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';

type EnvOverride = Record<string, string | undefined>;

const originalEnv = { ...process.env };
const RATE_LIMIT_MAX_REQUESTS = 120;

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

async function createRateLimitApp(overrides: EnvOverride = {}) {
  vi.resetModules();
  setEnv(overrides);

  const {
    createRateLimitMiddleware,
    cleanupExpiredRateLimitBuckets,
    getRateLimitBucketCount,
  } = await import('../../src/middlewares/rateLimitMiddleware');
  const { errorHandler } = await import('../../src/middlewares/errorHandler');

  const app = new Hono();
  app.onError(errorHandler);
  app.use('*', createRateLimitMiddleware());
  app.get('/ping', (c) => c.json({ success: true }));

  return { app, cleanupExpiredRateLimitBuckets, getRateLimitBucketCount };
}

async function exhaustBucket(
  app: Hono,
  headers: Record<string, string>,
): Promise<Response> {
  let response = await app.request('/ping', { headers });

  for (let index = 1; index <= RATE_LIMIT_MAX_REQUESTS; index += 1) {
    response = await app.request('/ping', { headers });
  }

  return response;
}

describe('rateLimitMiddleware', () => {
  afterEach(() => {
    restoreEnv();
    vi.useRealTimers();
    vi.resetModules();
  });

  it('uses x-real-ip over x-forwarded-for when both are present', async () => {
    const { app } = await createRateLimitApp({
      NODE_ENV: 'test',
    });

    const response1 = await app.request('/ping', {
      headers: {
        'x-real-ip': '203.0.113.10',
        'x-forwarded-for': '198.51.100.1',
      },
    });
    await app.request('/ping', {
      headers: {
        'x-real-ip': '203.0.113.10',
        'x-forwarded-for': '198.51.100.2',
      },
    });
    const response3 = await exhaustBucket(app, {
      'x-real-ip': '203.0.113.10',
      'x-forwarded-for': '198.51.100.3',
    });
    const json3 = await response3.json();

    expect(response1.status).toBe(200);
    expect(response3.status).toBe(429);
    expect(json3).toEqual({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: 'Çok fazla istek gönderildi.',
      },
    });
  });

  it('parses the first forwarded IP when x-real-ip is absent', async () => {
    const { app } = await createRateLimitApp({
      NODE_ENV: 'test',
    });

    const response1 = await app.request('/ping', {
      headers: {
        'x-forwarded-for': '198.51.100.1, 10.0.0.1',
      },
    });
    await app.request('/ping', {
      headers: {
        'x-forwarded-for': '198.51.100.1, 10.0.0.2',
      },
    });
    const response3 = await exhaustBucket(app, {
      'x-forwarded-for': '198.51.100.1, 10.0.0.3',
    });

    expect(response1.status).toBe(200);
    expect(response3.status).toBe(429);
  });

  it('does not trust x-forwarded-for as a production client identity without x-real-ip', async () => {
    const { app } = await createRateLimitApp({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://mydream:mydream@localhost:5433/mydream',
      JWT_SECRET: 'production-test-secret',
      OPENROUTER_API_KEY: 'openrouter-test-key',
      SUPABASE_URL: 'https://example.supabase.co',
      CORS_ALLOWED_ORIGINS: 'https://mydream.zimastack.com',
      DEV_AUTH_ENABLED: 'false',
    });

    const response1 = await app.request('/ping', {
      headers: {
        'x-forwarded-for': '198.51.100.1',
      },
    });
    await app.request('/ping', {
      headers: {
        'x-forwarded-for': '198.51.100.2',
      },
    });
    const response3 = await exhaustBucket(app, {
      'x-forwarded-for': '198.51.100.3',
    });

    expect(response1.status).toBe(200);
    expect(response3.status).toBe(429);
  });

  it('uses valid x-real-ip as the production proxy-provided identity', async () => {
    const { app } = await createRateLimitApp({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://mydream:mydream@localhost:5433/mydream',
      JWT_SECRET: 'production-test-secret',
      OPENROUTER_API_KEY: 'openrouter-test-key',
      SUPABASE_URL: 'https://example.supabase.co',
      CORS_ALLOWED_ORIGINS: 'https://mydream.zimastack.com',
      DEV_AUTH_ENABLED: 'false',
    });

    const response1 = await app.request('/ping', {
      headers: {
        'x-real-ip': '203.0.113.10',
      },
    });
    const response2 = await app.request('/ping', {
      headers: {
        'x-real-ip': '203.0.113.11',
      },
    });
    const response3 = await app.request('/ping', {
      headers: {
        'x-real-ip': '203.0.113.10',
      },
    });

    expect(response1.status).toBe(200);
    expect(response2.status).toBe(200);
    expect(response3.status).toBe(200);
  });

  it('cleans up expired buckets before handling a new request', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));

    const { app, cleanupExpiredRateLimitBuckets, getRateLimitBucketCount } = await createRateLimitApp({
      NODE_ENV: 'test',
    });

    await app.request('/ping', {
      headers: {
        'x-real-ip': '203.0.113.10',
      },
    });

    expect(getRateLimitBucketCount()).toBe(1);

    vi.setSystemTime(new Date('2026-01-01T00:01:01.000Z'));
    cleanupExpiredRateLimitBuckets(Date.now());

    expect(getRateLimitBucketCount()).toBe(0);
  });
});
