import { createMiddleware } from 'hono/factory';
import type { Context, MiddlewareHandler } from 'hono';
import { isIP } from 'node:net';
import { IS_DEV, IS_TEST, RATE_LIMIT_CONFIG } from '../config';
import { RateLimitError } from '../errors/RateLimitError';
import { REDIS_NS, getReadyRedis, redisKey } from '../services/redis';

export type RateLimitOptions = {
  /** Sliding window length in ms. Defaults to the global config. */
  windowMs?: number;
  /** Max requests allowed per window. Defaults to the global config. */
  maxRequests?: number;
  /** Bucket namespace so per-route limiters don't share counters. */
  prefix?: string;
};

type ResolvedRateLimit = {
  windowMs: number;
  maxRequests: number;
  prefix: string;
};

type RateLimitResult = {
  limited: boolean;
  remaining: number;
  /** Seconds until the window frees up (for RateLimit-Reset / Retry-After). */
  resetSeconds: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

// Atomic sliding-window log: drop entries older than the window, count what's
// left, then either reject or record the new hit. Avoids the fixed-window burst
// edge and holds across instances.
const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
local count = redis.call('ZCARD', key)
if count >= limit then
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  return {1, count, oldest[2]}
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return {0, count + 1, tostring(now)}
`;

function getForwardedClientIp(headerValue: string | undefined): string | undefined {
  if (!headerValue) {
    return undefined;
  }

  for (const candidate of headerValue.split(',')) {
    const normalized = candidate.trim();

    if (normalized.length > 0 && isIP(normalized)) {
      return normalized;
    }
  }

  return undefined;
}

function getClientKey(c: Context): string {
  const realIp = c.req.header('x-real-ip')?.trim();
  if (realIp && isIP(realIp)) {
    return realIp;
  }

  if (IS_DEV || IS_TEST) {
    const forwardedIp = getForwardedClientIp(c.req.header('x-forwarded-for'));
    if (forwardedIp) {
      return forwardedIp;
    }
  }

  return IS_DEV || IS_TEST ? 'local-dev' : 'unknown';
}

export function cleanupExpiredRateLimitBuckets(now = Date.now()): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function getRateLimitBucketCount(): number {
  return buckets.size;
}

function resolveOptions(options: RateLimitOptions): ResolvedRateLimit {
  return {
    windowMs: options.windowMs ?? RATE_LIMIT_CONFIG.WINDOW_MS,
    maxRequests: options.maxRequests ?? RATE_LIMIT_CONFIG.MAX_REQUESTS,
    prefix: options.prefix ?? 'global',
  };
}

/** In-memory fixed-window fallback (single instance, used when Redis is down). */
function consumeInMemory(bucketKey: string, config: ResolvedRateLimit, now: number): RateLimitResult {
  cleanupExpiredRateLimitBuckets(now);
  const current = buckets.get(bucketKey);

  if (!current || current.resetAt <= now) {
    buckets.set(bucketKey, { count: 1, resetAt: now + config.windowMs });
    return {
      limited: false,
      remaining: config.maxRequests - 1,
      resetSeconds: Math.ceil(config.windowMs / 1000),
    };
  }

  const resetSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));

  if (current.count >= config.maxRequests) {
    return { limited: true, remaining: 0, resetSeconds };
  }

  current.count += 1;
  return { limited: false, remaining: config.maxRequests - current.count, resetSeconds };
}

/** Redis atomic sliding-window log (shared across instances). */
async function consumeRedis(
  client: NonNullable<ReturnType<typeof getReadyRedis>>,
  bucketKey: string,
  config: ResolvedRateLimit,
  now: number,
): Promise<RateLimitResult> {
  const member = `${now}-${Math.random().toString(36).slice(2)}`;
  const raw = (await client.eval(
    SLIDING_WINDOW_LUA,
    1,
    bucketKey,
    String(now),
    String(config.windowMs),
    String(config.maxRequests),
    member,
  )) as [number, number, string];

  const count = raw[1];
  const reference = Number(raw[2]);
  const resetSeconds = Math.max(1, Math.ceil((reference + config.windowMs - now) / 1000));

  return {
    limited: raw[0] === 1,
    remaining: Math.max(0, config.maxRequests - count),
    resetSeconds,
  };
}

export function createRateLimitMiddleware(options: RateLimitOptions = {}): MiddlewareHandler {
  const config = resolveOptions(options);

  return createMiddleware(async (c, next) => {
    const now = Date.now();
    const bucketKey = `${config.prefix}:${getClientKey(c)}`;

    let result: RateLimitResult;
    const client = getReadyRedis();
    if (client) {
      try {
        result = await consumeRedis(client, redisKey(REDIS_NS.rateLimit, bucketKey), config, now);
      } catch {
        // Redis hiccup → degrade to the local limiter (never lose limiting).
        result = consumeInMemory(bucketKey, config, now);
      }
    } else {
      result = consumeInMemory(bucketKey, config, now);
    }

    c.header('RateLimit-Limit', String(config.maxRequests));
    c.header('RateLimit-Remaining', String(result.remaining));
    c.header('RateLimit-Reset', String(result.resetSeconds));

    if (result.limited) {
      c.header('Retry-After', String(result.resetSeconds));
      throw new RateLimitError();
    }

    await next();
  });
}
