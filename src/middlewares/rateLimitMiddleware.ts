import { createMiddleware } from 'hono/factory';
import type { MiddlewareHandler } from 'hono';
import { RATE_LIMIT_CONFIG } from '../config';
import { RateLimitError } from '../errors/RateLimitError';

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

export function createRateLimitMiddleware(): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    const forwardedFor = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    const clientKey = forwardedFor || c.req.header('x-real-ip') || 'unknown';
    const now = Date.now();
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
