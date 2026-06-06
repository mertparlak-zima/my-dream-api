import { Hono } from 'hono';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createIdempotencyMiddleware } from '../../src/middlewares/idempotencyMiddleware';
import { errorHandler } from '../../src/middlewares/errorHandler';
import { getReadyRedis } from '../../src/services/redis';

vi.mock('../../src/services/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/redis')>();
  return { ...actual, getReadyRedis: vi.fn() };
});

const getReadyRedisMock = vi.mocked(getReadyRedis);

/** Map-backed fake with real SET NX semantics for end-to-end flows. */
function makeFakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    set: vi.fn(async (key: string, value: string, _px: string, _ms: number, nx?: string) => {
      if (nx === 'NX') {
        if (store.has(key)) return null;
        store.set(key, value);
        return 'OK';
      }
      store.set(key, value);
      return 'OK';
    }),
    get: vi.fn(async (key: string) => (store.has(key) ? store.get(key)! : null)),
    del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
  };
}

type Handler = Parameters<Hono['post']>[1];

function buildApp(handler: Handler, opts = {}) {
  const app = new Hono();
  app.onError(errorHandler);
  app.use('*', createIdempotencyMiddleware({ prefix: 'idemtest', ...opts }));
  app.post('/spend', handler);
  return app;
}

const KEY = { 'Idempotency-Key': 'key-123', 'Content-Type': 'application/json' };

beforeEach(() => getReadyRedisMock.mockReset());
afterEach(() => vi.restoreAllMocks());

describe('idempotency middleware', () => {
  it('passes through when no Idempotency-Key is present', async () => {
    const handler = vi.fn((c) => c.json({ ok: true }));
    getReadyRedisMock.mockReturnValue(null);
    const res = await buildApp(handler).request('/spend', { method: 'POST', body: '{}' });
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('proceeds (fail-open) with a header when Redis is unavailable', async () => {
    getReadyRedisMock.mockReturnValue(null);
    const res = await buildApp((c) => c.json({ ok: true })).request('/spend', {
      method: 'POST', headers: KEY, body: '{}',
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Idempotency-Status')).toBe('unavailable');
  });

  it('rejects with 503 when Redis is unavailable and failClosed', async () => {
    getReadyRedisMock.mockReturnValue(null);
    const res = await buildApp((c) => c.json({ ok: true }), { failClosed: true }).request('/spend', {
      method: 'POST', headers: KEY, body: '{}',
    });
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'IDEMPOTENCY_UNAVAILABLE' } });
  });

  it('honours explicit ttlMs and the default prefix', async () => {
    const fake = makeFakeRedis();
    getReadyRedisMock.mockReturnValue(fake as never);
    const app = new Hono();
    app.onError(errorHandler);
    app.use('*', createIdempotencyMiddleware({ ttlMs: 60_000 })); // explicit ttl, default prefix
    app.post('/spend', (c) => c.json({ ok: true }));

    const res = await app.request('/spend', { method: 'POST', headers: KEY, body: '{}' });

    expect(res.status).toBe(200);
    expect([...fake.store.keys()][0]).toContain('idem:default:');
  });

  it('runs once and replays the stored response for a duplicate key', async () => {
    const fake = makeFakeRedis();
    getReadyRedisMock.mockReturnValue(fake as never);
    let calls = 0;
    const app = buildApp((c) => { calls += 1; return c.json({ n: calls }); });

    const first = await app.request('/spend', { method: 'POST', headers: KEY, body: '{"a":1}' });
    const second = await app.request('/spend', { method: 'POST', headers: KEY, body: '{"a":1}' });

    expect(await first.json()).toEqual({ n: 1 });
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual({ n: 1 });
    expect(second.headers.get('Idempotent-Replayed')).toBe('true');
    expect(calls).toBe(1); // handler not re-run
  });

  it('falls back to application/json content type when the response has none', async () => {
    const fake = makeFakeRedis();
    getReadyRedisMock.mockReturnValue(fake as never);
    // A TypedArray body produces a Response with no Content-Type header.
    const app = buildApp(() => new Response(new Uint8Array([114, 97, 119]), { status: 200 }));

    await app.request('/spend', { method: 'POST', headers: KEY, body: '{}' });
    const replay = await app.request('/spend', { method: 'POST', headers: KEY, body: '{}' });

    expect(replay.headers.get('Content-Type')).toBe('application/json');
    expect(await replay.text()).toBe('raw');
  });

  it('returns 409 when the same key is reused with a different payload', async () => {
    const fake = makeFakeRedis();
    getReadyRedisMock.mockReturnValue(fake as never);
    const app = buildApp((c) => c.json({ ok: true }));

    await app.request('/spend', { method: 'POST', headers: KEY, body: '{"a":1}' });
    const conflict = await app.request('/spend', { method: 'POST', headers: KEY, body: '{"a":2}' });

    expect(conflict.status).toBe(409);
    await expect(conflict.json()).resolves.toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REUSED' } });
  });

  it('returns 409 while the original request is still in progress', async () => {
    const fake = makeFakeRedis();
    fake.store.set('idem:idemtest:key-123', '__pending__');
    getReadyRedisMock.mockReturnValue(fake as never);

    const res = await buildApp((c) => c.json({ ok: true })).request('/spend', {
      method: 'POST', headers: KEY, body: '{}',
    });

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: { code: 'IDEMPOTENCY_IN_PROGRESS' } });
  });

  it('returns 409 in-progress when the lock vanished between SET and GET (race)', async () => {
    const racey = {
      set: vi.fn(async () => null),
      get: vi.fn(async () => null),
      del: vi.fn(async () => 0),
    };
    getReadyRedisMock.mockReturnValue(racey as never);

    const res = await buildApp((c) => c.json({ ok: true })).request('/spend', {
      method: 'POST', headers: KEY, body: '{}',
    });
    expect(res.status).toBe(409);
  });

  it('drops the lock and propagates when the handler throws', async () => {
    const fake = makeFakeRedis();
    getReadyRedisMock.mockReturnValue(fake as never);
    const app = buildApp(() => { throw new Error('handler boom'); });

    const res = await app.request('/spend', { method: 'POST', headers: KEY, body: '{}' });

    expect(res.status).toBe(500);
    expect(fake.del).toHaveBeenCalledWith('idem:idemtest:key-123');
    expect(fake.store.has('idem:idemtest:key-123')).toBe(false); // retryable
  });

  it('does not cache a 5xx response', async () => {
    const fake = makeFakeRedis();
    getReadyRedisMock.mockReturnValue(fake as never);
    const app = buildApp((c) => c.json({ error: 'nope' }, 500));

    const res = await app.request('/spend', { method: 'POST', headers: KEY, body: '{}' });

    expect(res.status).toBe(500);
    expect(fake.del).toHaveBeenCalledWith('idem:idemtest:key-123');
    expect(fake.store.has('idem:idemtest:key-123')).toBe(false);
  });
});
