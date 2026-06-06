/**
 * Local Docker smoke for the Redis layer (#54). Exercises cache hit/miss, a
 * rate-limit 429, and an idempotent replay end-to-end against a live Redis, then
 * prints the metrics snapshot.
 *
 * Usage (with the compose Redis up):
 *   docker compose up -d mydream-redis
 *   REDIS_URL=redis://localhost:6379 bun run redis:smoke
 */
import { Hono } from 'hono';

import { errorHandler } from '../src/middlewares/errorHandler';
import { createIdempotencyMiddleware } from '../src/middlewares/idempotencyMiddleware';
import { createRateLimitMiddleware } from '../src/middlewares/rateLimitMiddleware';
import { cached, invalidate } from '../src/services/cache';
import { closeRedis, getReadyRedis, getRedis } from '../src/services/redis';
import { getMetricsSnapshot, resetMetrics } from '../src/utils/metrics';

let failures = 0;

function check(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ok  ${label}`);
  } else {
    failures += 1;
    console.error(`  FAIL ${label}`);
  }
}

async function main(): Promise<void> {
  const client = getRedis();
  if (!client) {
    console.error('REDIS_URL is not set. Run: REDIS_URL=redis://localhost:6379 bun run redis:smoke');
    process.exit(1);
  }
  for (let i = 0; i < 100 && client.status !== 'ready'; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  check(getReadyRedis() !== null, `redis connected (status=${client.status})`);
  resetMetrics();

  // 1) Cache: miss → load → store, then hit (loader runs once).
  await invalidate('smoke:k');
  let loads = 0;
  const loader = async (): Promise<{ v: number }> => {
    loads += 1;
    return { v: loads };
  };
  const first = await cached('smoke:k', { ttlSeconds: 30, jitterRatio: 0 }, loader);
  const second = await cached('smoke:k', { ttlSeconds: 30, jitterRatio: 0 }, loader);
  check(loads === 1 && first.v === 1 && second.v === 1, 'cache miss→hit (loader called once)');

  // 2) Rate limit: limit 2 → third request is 429.
  await client.del('rl:smoke-rl:9.9.9.9');
  const rlApp = new Hono();
  rlApp.onError(errorHandler);
  rlApp.use('*', createRateLimitMiddleware({ maxRequests: 2, windowMs: 60_000, prefix: 'smoke-rl' }));
  rlApp.get('/p', (c) => c.json({ ok: true }));
  const rlHeaders = { headers: { 'x-real-ip': '9.9.9.9' } };
  const rl1 = await rlApp.request('/p', rlHeaders);
  const rl2 = await rlApp.request('/p', rlHeaders);
  const rl3 = await rlApp.request('/p', rlHeaders);
  check(
    rl1.status === 200 && rl2.status === 200 && rl3.status === 429,
    `rate limit 200/200/429 (got ${rl1.status}/${rl2.status}/${rl3.status})`,
  );

  // 3) Idempotency: same key twice → second is a replay.
  await client.del('idem:smoke-idem:smoke-key');
  const idemApp = new Hono();
  idemApp.onError(errorHandler);
  idemApp.use('*', createIdempotencyMiddleware({ prefix: 'smoke-idem' }));
  let charges = 0;
  idemApp.post('/spend', (c) => {
    charges += 1;
    return c.json({ charge: charges });
  });
  const idemReq = {
    method: 'POST',
    headers: { 'Idempotency-Key': 'smoke-key', 'Content-Type': 'application/json' },
    body: '{"a":1}',
  };
  const idem1 = await idemApp.request('/spend', idemReq);
  const idem2 = await idemApp.request('/spend', idemReq);
  check(
    idem1.status === 200 && charges === 1 && idem2.headers.get('Idempotent-Replayed') === 'true',
    'idempotent replay (handler ran once)',
  );

  console.log('\nmetrics:', JSON.stringify(getMetricsSnapshot()));

  // Cleanup.
  await invalidate('smoke:k');
  await client.del('rl:smoke-rl:9.9.9.9', 'idem:smoke-idem:smoke-key');
  await closeRedis();

  if (failures > 0) {
    console.error(`\nREDIS SMOKE FAILED (${failures} check(s))`);
    process.exit(1);
  }
  console.log('\nREDIS SMOKE PASSED');
  process.exit(0);
}

void main();
