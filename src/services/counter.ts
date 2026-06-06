import type { Redis } from 'ioredis';

import { REDIS_NS, getReadyRedis, redisKey } from './redis';

/**
 * Redis-backed **ephemeral** counters and markers under the `ctr:` namespace.
 *
 * Use for derived / non-authoritative per-user state — e.g. the Updates
 * (Yenilikler) unread indicator (#47): either an unread counter, or a
 * "last seen" marker compared against the latest content. Authoritative data
 * stays in Postgres; this layer is best-effort and degrades to safe defaults
 * (0 / null) when Redis is unavailable.
 *
 * Roadmap: project-docs `0016-de-dummy-backend-integration.md` · issue #53.
 */

function counterKey(name: string, scope: string): string {
  return redisKey(REDIS_NS.counter, 'c', name, scope);
}

function markerKey(name: string, scope: string): string {
  return redisKey(REDIS_NS.counter, 'm', name, scope);
}

/** Run an op against a ready Redis, falling back on absence or error. */
async function withRedis<T>(fallback: T, op: (client: Redis) => Promise<T>): Promise<T> {
  const client = getReadyRedis();
  if (!client) {
    return fallback;
  }
  try {
    return await op(client);
  } catch {
    return fallback;
  }
}

/** Increment a per-scope counter; returns the new value (0 when unavailable). */
export async function incrementCounter(
  name: string,
  scope: string,
  by = 1,
  ttlSeconds?: number,
): Promise<number> {
  return withRedis(0, async (client) => {
    const key = counterKey(name, scope);
    const value = await client.incrby(key, by);
    if (ttlSeconds !== undefined) {
      await client.expire(key, ttlSeconds);
    }
    return value;
  });
}

/** Read a counter; 0 when unset or unavailable. */
export async function getCounter(name: string, scope: string): Promise<number> {
  return withRedis(0, async (client) => {
    const raw = await client.get(counterKey(name, scope));
    return raw === null ? 0 : Number(raw);
  });
}

/** Clear a counter. */
export async function resetCounter(name: string, scope: string): Promise<void> {
  await withRedis(undefined, async (client) => {
    await client.del(counterKey(name, scope));
  });
}

/** Set a "last seen" style marker (e.g. last-seen update id / timestamp). */
export async function setMarker(
  name: string,
  scope: string,
  value: string,
  ttlSeconds?: number,
): Promise<void> {
  await withRedis(undefined, async (client) => {
    const key = markerKey(name, scope);
    if (ttlSeconds !== undefined) {
      await client.set(key, value, 'EX', ttlSeconds);
    } else {
      await client.set(key, value);
    }
  });
}

/** Read a marker; null when unset or unavailable. */
export async function getMarker(name: string, scope: string): Promise<string | null> {
  return withRedis<string | null>(null, async (client) => client.get(markerKey(name, scope)));
}
