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
      expect(REDIS_NS).toEqual({ cache: 'cache', rateLimit: 'rl', idempotency: 'idem', counter: 'ctr' });
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
