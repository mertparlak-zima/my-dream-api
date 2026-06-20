import { Redis } from 'ioredis';

import { REDIS_URL } from '../config';
import { logger } from '../utils/logger';
import { addSentryBreadcrumb } from '../utils/sentry';

/**
 * Shared Redis foundation for the De-Dummy & Backend Integration phase.
 *
 * One Redis instance backs cache, rate-limiting and idempotency; logical
 * separation is by **key-prefix** (`cache:` / `rl:` / `idem:`), and the future
 * BullMQ queue (Step 5) reuses the same instance under its own `bull:` prefix.
 *
 * Redis is **optional**: when `REDIS_URL` is unset the app runs in a degraded
 * mode (callers fall back to their source of truth). TLS is automatic when the
 * URL uses the `rediss://` scheme (production-aware).
 *
 * Roadmap: project-docs `0016-de-dummy-backend-integration.md` · issue #49.
 */

export type RedisHealth = 'ok' | 'disabled' | 'error';

/** Standard key namespaces (logical separation within a single Redis DB). */
export const REDIS_NS = {
  cache: 'cache',
  rateLimit: 'rl',
  idempotency: 'idem',
} as const;

let client: Redis | null = null;
let creationAttempted = false;
let shutdownRegistered = false;

/** Whether a Redis URL is configured (i.e. Redis-backed features are available). */
export function isRedisEnabled(url: string | undefined = REDIS_URL): boolean {
  return typeof url === 'string' && url.trim().length > 0;
}

/**
 * Build a namespaced key, e.g. `redisKey('cache', 'dict', 'all') → cache:dict:all`.
 */
export function redisKey(namespace: string, ...parts: (string | number)[]): string {
  return [namespace, ...parts].join(':');
}

function registerShutdownHandlers(): void {
  if (shutdownRegistered) {
    return;
  }
  shutdownRegistered = true;
  const onSignal = (): void => {
    void closeRedis();
  };
  process.once('SIGTERM', onSignal);
  process.once('SIGINT', onSignal);
}

function createClient(url: string): Redis {
  const redis = new Redis(url, {
    lazyConnect: true,
    enableReadyCheck: true,
    maxRetriesPerRequest: 2,
    // Bound every command so a down/unreachable Redis degrades fast (cache and
    // /health fall back) instead of hanging on the offline queue.
    connectTimeout: 10_000,
    commandTimeout: 1_000,
    retryStrategy: (times: number): number => Math.min(times * 200, 2000),
  });
  for (const event of ['connect', 'ready', 'end'] as const) {
    redis.on(event, () => {
      logger.debug(`redis ${event}`, { op: 'redis' });
      addSentryBreadcrumb('redis', `redis ${event}`, {}, 'info');
    });
  }
  redis.on('error', (error: Error) => {
    // Keep the process alive on transient Redis errors; features degrade rather
    // than crash. Log the message only (never the URL/credentials).
    logger.error('redis error', { op: 'redis', message: error.message });
    addSentryBreadcrumb('redis', 'redis error', { message: error.message }, 'error');
  });
  registerShutdownHandlers();
  // Start connecting in the background so `status` reaches 'ready' even for
  // readiness-gated callers (rate-limit) that fast-skip when not connected.
  void redis.connect().catch(() => undefined);
  return redis;
}

/** Lazily get the shared Redis client, or `null` when Redis is disabled. */
export function getRedis(): Redis | null {
  if (!isRedisEnabled()) {
    return null;
  }
  if (!client && !creationAttempted) {
    creationAttempted = true;
    client = createClient(REDIS_URL as string);
  }
  return client;
}

/**
 * Returns the shared client only when it is connected and ready, otherwise
 * `null`. Use for hot paths (rate-limit) that must fast-skip to a local
 * fallback instead of waiting on a connecting/down Redis.
 */
export function getReadyRedis(): Redis | null {
  const redis = getRedis();
  return redis !== null && redis.status === 'ready' ? redis : null;
}

/** Liveness ping. `disabled` when unconfigured, `error` on failure. */
export async function redisPing(): Promise<RedisHealth> {
  const redis = getRedis();
  if (!redis) {
    return 'disabled';
  }
  try {
    const pong = await redis.ping();
    return pong === 'PONG' ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

/** Graceful shutdown — close the connection and reset the singleton. */
export async function closeRedis(): Promise<void> {
  if (!client) {
    return;
  }
  const current = client;
  client = null;
  creationAttempted = false;
  try {
    await current.quit();
  } catch {
    current.disconnect();
  }
}
