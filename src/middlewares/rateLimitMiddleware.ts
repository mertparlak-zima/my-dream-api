import { createMiddleware } from 'hono/factory';
import type { Context, MiddlewareHandler } from 'hono';
import { isIP } from 'node:net';
import { IS_DEV, IS_TEST, RATE_LIMIT_CONFIG } from '../config';
import { RateLimitError } from '../errors/RateLimitError';

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

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

export function createRateLimitMiddleware(): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    const now = Date.now();
    cleanupExpiredRateLimitBuckets(now);

    const clientKey = getClientKey(c);
    const current = buckets.get(clientKey);

    if (!current || current.resetAt <= now) {
      buckets.set(clientKey, {
        count: 1,
        resetAt: now + RATE_LIMIT_CONFIG.WINDOW_MS,
      });
      await next();
      return;
    }

    if (current.count >= RATE_LIMIT_CONFIG.MAX_REQUESTS) {
      throw new RateLimitError();
    }

    current.count += 1;
    await next();
  });
}
