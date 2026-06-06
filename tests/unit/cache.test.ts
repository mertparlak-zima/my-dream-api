import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CACHE_KEY, CACHE_TTL, cached, invalidate, invalidatePrefix } from '../../src/services/cache';
import { getRedis } from '../../src/services/redis';

vi.mock('../../src/services/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/redis')>();
  return { ...actual, getRedis: vi.fn() };
});

const getRedisMock = vi.mocked(getRedis);

type FakeRedis = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  scan: ReturnType<typeof vi.fn>;
};

function makeRedis(overrides: Partial<FakeRedis> = {}): FakeRedis {
  return {
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
    scan: vi.fn(async () => ['0', []]),
    ...overrides,
  };
}

beforeEach(() => {
  getRedisMock.mockReset();
  delete process.env.CACHE_DISABLED;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.CACHE_DISABLED;
});

describe('cache policy', () => {
  it('defines positive TTLs ordered by how often each dataset changes', () => {
    expect(CACHE_TTL.DICTIONARY).toBeGreaterThan(0);
    expect(CACHE_TTL.DICTIONARY).toBeGreaterThanOrEqual(CACHE_TTL.INTERPRETERS);
    expect(CACHE_TTL.INTERPRETERS).toBeGreaterThanOrEqual(CACHE_TTL.UPDATES);
  });

  it('exposes canonical cache key prefixes', () => {
    expect(CACHE_KEY).toEqual({ dictionary: 'dict', interpreters: 'interpreters', updates: 'updates' });
  });
});

describe('cached', () => {
  it('returns a cached hit without calling the loader', async () => {
    const redis = makeRedis({ get: vi.fn(async () => JSON.stringify({ a: 1 })) });
    getRedisMock.mockReturnValue(redis as never);
    const loader = vi.fn(async () => ({ a: 999 }));

    const result = await cached('dict:all', { ttlSeconds: 60, jitterRatio: 0 }, loader);

    expect(result).toEqual({ a: 1 });
    expect(loader).not.toHaveBeenCalled();
    expect(redis.get).toHaveBeenCalledWith('cache:dict:all');
  });

  it('loads and writes through on a miss (jitterRatio 0 → exact TTL)', async () => {
    const redis = makeRedis();
    getRedisMock.mockReturnValue(redis as never);
    const loader = vi.fn(async () => ({ a: 2 }));

    const result = await cached('dict:all', { ttlSeconds: 60, jitterRatio: 0 }, loader);

    expect(result).toEqual({ a: 2 });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith('cache:dict:all', JSON.stringify({ a: 2 }), 'EX', 60);
  });

  it('applies the default jitter ratio to the TTL', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const redis = makeRedis();
    getRedisMock.mockReturnValue(redis as never);

    await cached('k', { ttlSeconds: 100 }, async () => 'v');

    // 100 + round(100 * 0.1 * 1) = 110
    expect(redis.set).toHaveBeenCalledWith('cache:k', JSON.stringify('v'), 'EX', 110);
  });

  it('falls back to the loader when the cache read throws', async () => {
    const redis = makeRedis({ get: vi.fn(async () => { throw new Error('boom'); }) });
    getRedisMock.mockReturnValue(redis as never);
    const loader = vi.fn(async () => 'fresh');

    await expect(cached('k', { ttlSeconds: 10, jitterRatio: 0 }, loader)).resolves.toBe('fresh');
    expect(loader).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalled();
  });

  it('still returns the value when the cache write throws', async () => {
    const redis = makeRedis({ set: vi.fn(async () => { throw new Error('boom'); }) });
    getRedisMock.mockReturnValue(redis as never);

    await expect(cached('k', { ttlSeconds: 10, jitterRatio: 0 }, async () => 'v')).resolves.toBe('v');
  });

  it('does not cache an undefined loader result', async () => {
    const redis = makeRedis();
    getRedisMock.mockReturnValue(redis as never);

    await expect(cached('k', { ttlSeconds: 10 }, async () => undefined)).resolves.toBeUndefined();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('bypasses the cache when Redis is unavailable', async () => {
    getRedisMock.mockReturnValue(null);
    const loader = vi.fn(async () => 'v');

    await expect(cached('k', { ttlSeconds: 10 }, loader)).resolves.toBe('v');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('bypasses the cache when CACHE_DISABLED=true', async () => {
    process.env.CACHE_DISABLED = 'true';
    const redis = makeRedis();
    getRedisMock.mockReturnValue(redis as never);

    await expect(cached('k', { ttlSeconds: 10 }, async () => 'v')).resolves.toBe('v');
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
});

describe('invalidate', () => {
  it('deletes the prefixed key', async () => {
    const redis = makeRedis();
    getRedisMock.mockReturnValue(redis as never);
    await invalidate('dict:all');
    expect(redis.del).toHaveBeenCalledWith('cache:dict:all');
  });

  it('is a no-op without Redis', async () => {
    getRedisMock.mockReturnValue(null);
    await expect(invalidate('dict:all')).resolves.toBeUndefined();
  });

  it('swallows delete errors', async () => {
    const redis = makeRedis({ del: vi.fn(async () => { throw new Error('boom'); }) });
    getRedisMock.mockReturnValue(redis as never);
    await expect(invalidate('k')).resolves.toBeUndefined();
  });
});

describe('invalidatePrefix', () => {
  it('scans across pages and deletes matched keys', async () => {
    const scan = vi
      .fn()
      .mockResolvedValueOnce(['7', ['cache:dict:a', 'cache:dict:b']])
      .mockResolvedValueOnce(['0', []]);
    const redis = makeRedis({ scan });
    getRedisMock.mockReturnValue(redis as never);

    await invalidatePrefix('dict:');

    expect(scan).toHaveBeenCalledTimes(2);
    expect(redis.del).toHaveBeenCalledWith('cache:dict:a', 'cache:dict:b');
  });

  it('is a no-op without Redis', async () => {
    getRedisMock.mockReturnValue(null);
    await expect(invalidatePrefix('dict:')).resolves.toBeUndefined();
  });

  it('swallows scan errors', async () => {
    const redis = makeRedis({ scan: vi.fn(async () => { throw new Error('boom'); }) });
    getRedisMock.mockReturnValue(redis as never);
    await expect(invalidatePrefix('dict:')).resolves.toBeUndefined();
  });
});
