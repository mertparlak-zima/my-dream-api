/**
 * Lightweight in-process counters for Redis-layer observability — cache
 * hit/miss, rate-limit blocks, idempotency replays. Cheap and dependency-free;
 * surfaced via logs / the local Docker smoke. Not a substitute for a real
 * metrics backend, just enough signal to see the layer working.
 *
 * Roadmap: project-docs `0016-de-dummy-backend-integration.md` · issue #54.
 */

export const METRIC = {
  cacheHit: 'cache.hit',
  cacheMiss: 'cache.miss',
  rateLimitBlocked: 'ratelimit.blocked',
  idempotencyReplayed: 'idempotency.replayed',
} as const;

const counters = new Map<string, number>();

/** Increment a named counter (default by 1). */
export function incrementMetric(name: string, by = 1): void {
  counters.set(name, (counters.get(name) ?? 0) + by);
}

/** Snapshot all counters as a plain object. */
export function getMetricsSnapshot(): Record<string, number> {
  return Object.fromEntries(counters);
}

/** Clear all counters (tests / between smoke runs). */
export function resetMetrics(): void {
  counters.clear();
}
