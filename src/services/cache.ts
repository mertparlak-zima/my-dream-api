import { logger } from '../utils/logger';
import { METRIC, incrementMetric } from '../utils/metrics';
import { REDIS_NS, getRedis, redisKey } from './redis';

/**
 * Redis read-through cache for read-heavy endpoints (dictionary #42,
 * interpreters #41, updates #47). Values are JSON-serialized under the `cache:`
 * prefix with a jittered TTL (to avoid synchronized expiry / stampede).
 *
 * Cache is best-effort: when Redis is disabled, bypassed, or erroring, callers
 * still get a correct result from the loader. Writes invalidate via
 * {@link invalidate} (single key) or {@link invalidatePrefix} (SCAN-based).
 *
 * Bypass at runtime with `CACHE_DISABLED=true` (keeps Redis up for rate-limit /
 * idempotency while skipping the cache — handy for local debugging).
 *
 * Roadmap: project-docs `0016-de-dummy-backend-integration.md` · issue #50.
 */

/**
 * Centralized TTL policy (seconds) so cache lifetimes are consistent and
 * intentional across endpoints — tuned to how often each dataset changes.
 * Every cached read is also invalidated on the matching write, so these are
 * staleness ceilings, not the primary freshness mechanism.
 */
export const CACHE_TTL = {
  /** Symbols / themes / categories — rarely changes; invalidated on edit/seed. */
  DICTIONARY: 7 * 24 * 60 * 60, // 1 week
  /** Interpreter directory + enrichment — semi-static. */
  INTERPRETERS: 60 * 60, // 1h
  /** Yenilikler editorial feed — changes more often. */
  UPDATES: 5 * 60, // 5m
} as const;

/**
 * Canonical cache keys / prefixes (without the `cache:` namespace, which
 * {@link cached} adds). Writes invalidate the single key and/or the prefix so
 * list + detail entries stay consistent.
 */
export const CACHE_KEY = {
  dictionary: 'dict',
  interpreters: 'interpreters',
  updates: 'updates',
} as const;

export type CachedOptions = {
  /** Base time-to-live in seconds (use a {@link CACHE_TTL} value). */
  ttlSeconds: number;
  /** Random extra TTL fraction (0–1) to de-synchronize expiry. Default 0.1. */
  jitterRatio?: number;
};

const SCAN_COUNT = 100;

function cacheBypassed(): boolean {
  return process.env.CACHE_DISABLED === 'true';
}

function ttlWithJitter(ttlSeconds: number, jitterRatio = 0.1): number {
  return ttlSeconds + Math.round(ttlSeconds * jitterRatio * Math.random());
}

/**
 * Read-through cache: returns the cached value when present, otherwise runs
 * `loader`, caches its result, and returns it.
 */
export async function cached<T>(
  key: string,
  options: CachedOptions,
  loader: () => Promise<T>,
): Promise<T> {
  const client = cacheBypassed() ? null : getRedis();
  const fullKey = redisKey(REDIS_NS.cache, key);

  if (client) {
    try {
      const hit = await client.get(fullKey);
      if (hit !== null) {
        incrementMetric(METRIC.cacheHit);
        logger.debug('cache hit', { op: 'cache', key: fullKey });
        return JSON.parse(hit) as T;
      }
    } catch {
      // Read failure → fall through to the loader (cache is best-effort).
    }
  }

  const value = await loader();

  if (client) {
    incrementMetric(METRIC.cacheMiss);
    logger.debug('cache miss', { op: 'cache', key: fullKey });
    if (value !== undefined) {
      try {
        await client.set(
          fullKey,
          JSON.stringify(value),
          'EX',
          ttlWithJitter(options.ttlSeconds, options.jitterRatio),
        );
      } catch {
        // Write failure is non-fatal; the caller already has the value.
      }
    }
  }

  return value;
}

/** Drop a single cached entry. No-op when Redis is unavailable. */
export async function invalidate(key: string): Promise<void> {
  const client = getRedis();
  if (!client) {
    return;
  }
  try {
    await client.del(redisKey(REDIS_NS.cache, key));
    logger.debug('cache invalidated', { op: 'cache', key });
  } catch {
    // Best-effort invalidation.
  }
}

/** Drop every cached entry under a key prefix via non-blocking SCAN. */
export async function invalidatePrefix(prefix: string): Promise<void> {
  const client = getRedis();
  if (!client) {
    return;
  }
  const match = `${redisKey(REDIS_NS.cache, prefix)}*`;
  let cursor = '0';
  try {
    do {
      const [next, keys] = await client.scan(cursor, 'MATCH', match, 'COUNT', SCAN_COUNT);
      cursor = next;
      if (keys.length > 0) {
        await client.del(...keys);
        logger.debug('cache invalidated', { op: 'cache', prefix, count: keys.length });
      }
    } while (cursor !== '0');
  } catch {
    // Best-effort invalidation.
  }
}
