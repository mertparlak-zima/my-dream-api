import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createRateLimitMiddleware } from '../../src/middlewares/rateLimitMiddleware';
import { errorHandler } from '../../src/middlewares/errorHandler';
import { getReadyRedis } from '../../src/services/redis';

vi.mock('../../src/services/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/redis')>();
  return { ...actual, getReadyRedis: vi.fn() };
});

const getReadyRedisMock = vi.mocked(getReadyRedis);

function buildApp() {
  const app = new Hono();
  app.onError(errorHandler);
  app.use('*', createRateLimitMiddleware({ maxRequests: 2, windowMs: 60_000, prefix: 'rltest' }));
  app.get('/ping', (c) => c.json({ success: true }));
  return app;
}

const HEADERS = { 'x-real-ip': '203.0.113.50' };

beforeEach(() => getReadyRedisMock.mockReset());
afterEach(() => vi.restoreAllMocks());

describe('rate limiting (Redis sliding-window)', () => {
  it('allows under the limit and sets RateLimit headers', async () => {
    const evalFn = vi.fn(async () => [0, 1, String(Date.now())]);
    getReadyRedisMock.mockReturnValue({ eval: evalFn } as never);

    const res = await buildApp().request('/ping', { headers: HEADERS });

    expect(res.status).toBe(200);
    expect(res.headers.get('RateLimit-Limit')).toBe('2');
    expect(res.headers.get('RateLimit-Remaining')).toBe('1');
    expect(res.headers.get('RateLimit-Reset')).not.toBeNull();
    expect(evalFn).toHaveBeenCalledTimes(1);
  });

  it('rejects with 429 when the window is exhausted', async () => {
    const now = Date.now();
    const evalFn = vi.fn(async () => [1, 2, String(now)]);
    getReadyRedisMock.mockReturnValue({ eval: evalFn } as never);

    const res = await buildApp().request('/ping', { headers: HEADERS });

    expect(res.status).toBe(429);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Çok fazla istek gönderildi.' },
    });
  });

  it('degrades to the in-memory limiter when the Redis call throws', async () => {
    const evalFn = vi.fn(async () => { throw new Error('redis down'); });
    getReadyRedisMock.mockReturnValue({ eval: evalFn } as never);

    const res = await buildApp().request('/ping', { headers: HEADERS });

    // Falls back to the local limiter and still serves the request.
    expect(res.status).toBe(200);
    expect(res.headers.get('RateLimit-Limit')).toBe('2');
    expect(evalFn).toHaveBeenCalledTimes(1);
  });
});
