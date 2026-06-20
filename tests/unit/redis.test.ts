import { describe, expect, it } from 'vitest';

import {
  REDIS_NS,
  closeRedis,
  getRedis,
  isRedisEnabled,
  redisKey,
  redisPing,
} from '../../src/services/redis';

describe('redis service', () => {
  describe('isRedisEnabled', () => {
    it('is true for a non-empty URL', () => {
      expect(isRedisEnabled('redis://localhost:6379')).toBe(true);
      expect(isRedisEnabled('rediss://user:pass@host:6380')).toBe(true);
    });

    it('is false for undefined / empty / whitespace', () => {
      expect(isRedisEnabled(undefined)).toBe(false);
      expect(isRedisEnabled('')).toBe(false);
      expect(isRedisEnabled('   ')).toBe(false);
    });

    it('defaults to the runtime REDIS_URL (disabled in the test env)', () => {
      expect(isRedisEnabled()).toBe(false);
    });
  });

  describe('redisKey', () => {
    it('joins the namespace and parts with colons', () => {
      expect(redisKey(REDIS_NS.cache, 'dict', 'all')).toBe('cache:dict:all');
      expect(redisKey(REDIS_NS.rateLimit, 'user', 42)).toBe('rl:user:42');
      expect(redisKey(REDIS_NS.idempotency)).toBe('idem');
    });

    it('exposes the standard namespaces', () => {
      expect(REDIS_NS).toEqual({ cache: 'cache', rateLimit: 'rl', idempotency: 'idem' });
    });
  });

  describe('degraded mode (no REDIS_URL)', () => {
    it('getRedis returns null', () => {
      expect(getRedis()).toBeNull();
    });

    it('redisPing reports disabled', async () => {
      await expect(redisPing()).resolves.toBe('disabled');
    });

    it('closeRedis is a no-op when no client exists', async () => {
      await expect(closeRedis()).resolves.toBeUndefined();
    });
  });
});

describe('redis service (enabled mode, mocked ioredis)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let redisMod: typeof import('../../src/services/redis');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let instances: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let onceSpy: any;

  beforeEach(async () => {
    vi.resetModules();
    process.env.REDIS_URL = 'redis://localhost:6379';
    instances = [];

    class FakeRedis {
      status = 'ready';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handlers: Record<string, (arg: any) => void> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      opts: any;
      url: string;
      connect = vi.fn(async () => { this.status = 'ready'; });
      ping = vi.fn(async () => 'PONG');
      quit = vi.fn(async () => 'OK');
      disconnect = vi.fn(() => undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      constructor(url: string, opts: any) {
        this.url = url;
        this.opts = opts;
        instances.push(this);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      on(event: string, cb: (arg: any) => void) {
        this.handlers[event] = cb;
        return this;
      }
    }

    vi.doMock('ioredis', () => ({ Redis: FakeRedis }));
    onceSpy = vi.spyOn(process, 'once').mockImplementation(() => process);
    redisMod = await import('../../src/services/redis');
  });

  afterEach(() => {
    delete process.env.REDIS_URL;
    onceSpy.mockRestore();
    vi.doUnmock('ioredis');
    vi.resetModules();
  });

  it('creates one shared client with bounded options + background connect', () => {
    const a = redisMod.getRedis();
    const b = redisMod.getRedis();
    expect(a).toBe(b);
    expect(instances).toHaveLength(1);
    expect(instances[0].opts).toMatchObject({
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      connectTimeout: 10_000,
      commandTimeout: 1_000,
    });
    expect(instances[0].connect).toHaveBeenCalled();
  });

  it('emits breadcrumbs on lifecycle events, logs errors, and caps retry backoff', async () => {
    redisMod.getRedis();
    const inst = instances[0];
    const loggerMod = await import('../../src/utils/logger');
    const errSpy = vi.spyOn(loggerMod.logger, 'error');
    // Lifecycle handlers (breadcrumb no-ops when Sentry is disabled in tests).
    inst.handlers.connect();
    inst.handlers.ready();
    inst.handlers.end();
    inst.handlers.error(new Error('boom'));
    expect(errSpy).toHaveBeenCalledWith('redis error', expect.objectContaining({ message: 'boom' }));
    expect(inst.opts.retryStrategy(1)).toBe(200);
    expect(inst.opts.retryStrategy(100)).toBe(2000);
    errSpy.mockRestore();
  });

  it('getReadyRedis returns the client only when status is ready', () => {
    const c = redisMod.getRedis();
    expect(redisMod.getReadyRedis()).toBe(c);
    instances[0].status = 'connecting';
    expect(redisMod.getReadyRedis()).toBeNull();
  });

  it('redisPing reports ok / error (non-PONG) / error (throw)', async () => {
    redisMod.getRedis();
    const inst = instances[0];
    await expect(redisMod.redisPing()).resolves.toBe('ok');
    inst.ping.mockResolvedValueOnce('NOPE');
    await expect(redisMod.redisPing()).resolves.toBe('error');
    inst.ping.mockRejectedValueOnce(new Error('down'));
    await expect(redisMod.redisPing()).resolves.toBe('error');
  });

  it('closeRedis quits and a fresh client re-enters createClient (shutdown guard)', async () => {
    redisMod.getRedis();
    await redisMod.closeRedis();
    expect(instances[0].quit).toHaveBeenCalled();
    redisMod.getRedis(); // second createClient → registerShutdownHandlers early-returns
    expect(instances).toHaveLength(2);
  });

  it('closeRedis falls back to disconnect when quit throws', async () => {
    redisMod.getRedis();
    instances[0].quit.mockRejectedValueOnce(new Error('quit failed'));
    await redisMod.closeRedis();
    expect(instances[0].disconnect).toHaveBeenCalled();
  });

  it('registers a SIGTERM handler that closes redis', async () => {
    redisMod.getRedis();
    const sigterm = onceSpy.mock.calls.find((args: unknown[]) => args[0] === 'SIGTERM');
    expect(sigterm).toBeTruthy();
    sigterm[1]();
    await Promise.resolve();
    expect(instances[0].quit).toHaveBeenCalled();
  });
});
