import { createMiddleware } from 'hono/factory';
import type { MiddlewareHandler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { createHash } from 'node:crypto';

import { AppError } from '../errors/AppError';
import { ConflictError } from '../errors/ConflictError';
import { logger } from '../utils/logger';
import { METRIC, incrementMetric } from '../utils/metrics';
import { REDIS_NS, getReadyRedis, redisKey } from '../services/redis';

/**
 * Idempotency middleware for mutating endpoints (credit spend / özel sor #43;
 * IAP fulfilment later in Monetization). A client sends an `Idempotency-Key`
 * header; the first request runs and its response is stored, and any retry with
 * the same key replays that response instead of re-executing — so a retried
 * request never double-charges.
 *
 * A `PENDING` sentinel set with `NX` acts as the lock: concurrent duplicates and
 * key reuse with a different payload both return 409.
 *
 * Roadmap: project-docs `0016-de-dummy-backend-integration.md` · issue #52.
 */

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const PENDING = '__pending__';

export type IdempotencyOptions = {
  /** How long a key is remembered. Default 24h. */
  ttlMs?: number;
  /** Namespace so unrelated endpoints don't share keys. */
  prefix?: string;
  /**
   * Behaviour when Redis is unavailable. `false` (default) proceeds without
   * dedupe (dev-friendly); `true` rejects with 503 for money-critical routes.
   */
  failClosed?: boolean;
};

type StoredRecord = {
  fingerprint: string;
  status: number;
  body: string;
  contentType: string;
};

function fingerprint(method: string, path: string, body: string): string {
  return createHash('sha256').update(`${method}\n${path}\n${body}`).digest('hex');
}

export function createIdempotencyMiddleware(options: IdempotencyOptions = {}): MiddlewareHandler {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const prefix = options.prefix ?? 'default';
  const failClosed = options.failClosed ?? false;

  return createMiddleware(async (c, next) => {
    const idempotencyKey = c.req.header('Idempotency-Key')?.trim();
    if (!idempotencyKey) {
      await next();
      return;
    }

    const client = getReadyRedis();
    if (!client) {
      if (failClosed) {
        throw new AppError(
          503,
          'IDEMPOTENCY_UNAVAILABLE',
          'İşlem şu anda güvenli tekrar koruması olmadan yapılamıyor. Birazdan tekrar dene.',
        );
      }
      c.header('Idempotency-Status', 'unavailable');
      await next();
      return;
    }

    const key = redisKey(REDIS_NS.idempotency, prefix, idempotencyKey);
    const requestBody = await c.req.raw.clone().text();
    const fp = fingerprint(c.req.method, c.req.path, requestBody);

    const acquired = await client.set(key, PENDING, 'PX', ttlMs, 'NX');
    if (acquired !== 'OK') {
      const existing = await client.get(key);
      if (existing === null || existing === PENDING) {
        logger.warn('idempotency in progress', { op: 'idempotency', key });
        throw new ConflictError(
          'Aynı istek hâlâ işleniyor. Birazdan tekrar dene.',
          'IDEMPOTENCY_IN_PROGRESS',
        );
      }
      const record = JSON.parse(existing) as StoredRecord;
      if (record.fingerprint !== fp) {
        logger.warn('idempotency key reused', { op: 'idempotency', key });
        throw new ConflictError(
          'Bu Idempotency-Key farklı bir istek için kullanılmış.',
          'IDEMPOTENCY_KEY_REUSED',
        );
      }
      incrementMetric(METRIC.idempotencyReplayed);
      logger.info('idempotency replay', { op: 'idempotency', key });
      c.header('Idempotent-Replayed', 'true');
      c.res = c.newResponse(record.body, record.status as ContentfulStatusCode, {
        'Content-Type': record.contentType,
      });
      return;
    }

    await next();

    // Hono routes errors through app.onError, so a thrown handler surfaces here
    // as a response (not a rejection): a 5xx is transient → drop the key so a
    // retry can run; any other status (incl. 4xx business errors like "no
    // credits") is deterministic → store it so retries replay the same result.
    const response = c.res;
    if (response.status >= 500) {
      await client.del(key);
      return;
    }

    const storedRecord: StoredRecord = {
      fingerprint: fp,
      status: response.status,
      body: await response.clone().text(),
      contentType: response.headers.get('content-type') ?? 'application/json',
    };
    await client.set(key, JSON.stringify(storedRecord), 'PX', ttlMs);
  });
}
