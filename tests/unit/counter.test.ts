import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getCounter,
  getMarker,
  incrementCounter,
  resetCounter,
  setMarker,
} from '../../src/services/counter';
import { getReadyRedis } from '../../src/services/redis';

vi.mock('../../src/services/redis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/services/redis')>();
  return { ...actual, getReadyRedis: vi.fn() };
});

const getReadyRedisMock = vi.mocked(getReadyRedis);

function makeRedis(overrides: Record<string, unknown> = {}) {
  return {
    incrby: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
    ...overrides,
  };
}

beforeEach(() => getReadyRedisMock.mockReset());
afterEach(() => vi.restoreAllMocks());

describe('counter service', () => {
  it('returns the fallback when Redis is unavailable', async () => {
    getReadyRedisMock.mockReturnValue(null);
    await expect(incrementCounter('updates-unread', 'user-1')).resolves.toBe(0);
    await expect(getCounter('updates-unread', 'user-1')).resolves.toBe(0);
    await expect(getMarker('seen', 'user-1')).resolves.toBeNull();
    await expect(resetCounter('updates-unread', 'user-1')).resolves.toBeUndefined();
  });

  it('returns the fallback when a Redis op throws', async () => {
    const redis = makeRedis({ incrby: vi.fn(async () => { throw new Error('boom'); }) });
    getReadyRedisMock.mockReturnValue(redis as never);
    await expect(incrementCounter('updates-unread', 'user-1')).resolves.toBe(0);
  });

  it('increments a counter under the ctr namespace', async () => {
    const redis = makeRedis({ incrby: vi.fn(async () => 3) });
    getReadyRedisMock.mockReturnValue(redis as never);

    await expect(incrementCounter('updates-unread', 'user-1', 2)).resolves.toBe(3);
    expect(redis.incrby).toHaveBeenCalledWith('ctr:c:updates-unread:user-1', 2);
    expect(redis.expire).not.toHaveBeenCalled();
  });

  it('applies a TTL when provided on increment', async () => {
    const redis = makeRedis();
    getReadyRedisMock.mockReturnValue(redis as never);

    await incrementCounter('updates-unread', 'user-1', 1, 3600);
    expect(redis.expire).toHaveBeenCalledWith('ctr:c:updates-unread:user-1', 3600);
  });

  it('reads counters (0 when unset, number when set)', async () => {
    const unset = makeRedis({ get: vi.fn(async () => null) });
    getReadyRedisMock.mockReturnValue(unset as never);
    await expect(getCounter('updates-unread', 'user-1')).resolves.toBe(0);

    const set = makeRedis({ get: vi.fn(async () => '5') });
    getReadyRedisMock.mockReturnValue(set as never);
    await expect(getCounter('updates-unread', 'user-1')).resolves.toBe(5);
  });

  it('resets a counter', async () => {
    const redis = makeRedis();
    getReadyRedisMock.mockReturnValue(redis as never);
    await resetCounter('updates-unread', 'user-1');
    expect(redis.del).toHaveBeenCalledWith('ctr:c:updates-unread:user-1');
  });

  it('sets a marker with and without TTL', async () => {
    const redis = makeRedis();
    getReadyRedisMock.mockReturnValue(redis as never);

    await setMarker('seen', 'user-1', 'update-42');
    expect(redis.set).toHaveBeenCalledWith('ctr:m:seen:user-1', 'update-42');

    await setMarker('seen', 'user-1', 'update-43', 600);
    expect(redis.set).toHaveBeenCalledWith('ctr:m:seen:user-1', 'update-43', 'EX', 600);
  });

  it('reads a marker', async () => {
    const redis = makeRedis({ get: vi.fn(async () => 'update-42') });
    getReadyRedisMock.mockReturnValue(redis as never);
    await expect(getMarker('seen', 'user-1')).resolves.toBe('update-42');
    expect(redis.get).toHaveBeenCalledWith('ctr:m:seen:user-1');
  });
});
