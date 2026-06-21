import { randomUUID } from 'node:crypto';

import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { DREAM_PROCESSING_CONFIG } from '../../config';
import { DREAM_STATUS } from '../../constants/domain';
import { db } from '../../db';
import { AppError } from '../../errors/AppError';
import { logger, serializeError } from '../../utils/logger';
import { captureDreamProcessingError } from '../../utils/sentry';
import { aiModels } from '../ai_models/models.schema';
import { refundDream, type DreamRefundInput, type Tx } from '../credits/credit-engine';
import { interpreters } from '../interpreters/interpreters.schema';
import { dreams } from './dreams.schema';
import type { DreamInterpretationProvider } from './dreams.provider';
import { OpenRouterDreamInterpretationProvider } from './openrouter.provider';

export type ProcessDreamOptions = {
  completionDelayMs?: number;
  provider?: DreamInterpretationProvider;
};

const { MAX_ATTEMPTS, LEASE_MS } = DREAM_PROCESSING_CONFIG;

const defaultProvider = new OpenRouterDreamInterpretationProvider();
let scheduledProvider: DreamInterpretationProvider = defaultProvider;

export function configureDreamProcessingProvider(provider: DreamInterpretationProvider): void {
  scheduledProvider = provider;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function sanitizeInterpretation(interpretation: string): string {
  const normalized = interpretation
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (normalized.length <= DREAM_PROCESSING_CONFIG.MAX_INTERPRETATION_LENGTH) {
    return normalized;
  }

  return normalized.slice(0, DREAM_PROCESSING_CONFIG.MAX_INTERPRETATION_LENGTH).trimEnd();
}

const refundSelect = {
  id: dreams.id,
  userId: dreams.userId,
  quotaSource: dreams.quotaSource,
  quotaKey: dreams.quotaKey,
  quotaWindowStartedAt: dreams.quotaWindowStartedAt,
  quotaUnitsConsumed: dreams.quotaUnitsConsumed,
  usedCoins: dreams.usedCoins,
} as const;

/**
 * Atomically claims a dream for processing: only a PENDING dream or a PROCESSING
 * one whose lease has expired, and only while it has attempts left. Bumps the
 * attempt counter and stamps a fresh attempt id + lease so a stale worker can
 * never overwrite a newer attempt's result.
 */
async function claimDream(dreamId: string, attemptId: string, now: Date): Promise<boolean> {
  const leaseExpiry = new Date(now.getTime() + LEASE_MS);
  const rows = await db.execute(sql`
    UPDATE dreams
    SET status = ${DREAM_STATUS.PROCESSING},
        processing_attempt_id = ${attemptId},
        processing_started_at = ${now},
        processing_lease_expires_at = ${leaseExpiry},
        attempt_count = attempt_count + 1,
        updated_at = ${now}
    WHERE id = ${dreamId}
      AND attempt_count < ${MAX_ATTEMPTS}
      AND (status = 'PENDING' OR (status = 'PROCESSING' AND processing_lease_expires_at < ${now}))
    RETURNING id
  `);
  return rows.length > 0;
}

/**
 * Claims the refund for a (FAILED) dream exactly once via the refunded_at guard,
 * then restores quota/wallet to the original source. Idempotent under retries
 * and concurrent sweeps.
 */
async function claimAndRefund(tx: Tx, dreamId: string, now: Date): Promise<void> {
  const [claimed] = await tx
    .update(dreams)
    .set({ refundedAt: now, updatedAt: now })
    .where(and(eq(dreams.id, dreamId), isNull(dreams.refundedAt)))
    .returning(refundSelect);

  if (!claimed) {
    return;
  }

  const refundTransactionId = await refundDream(tx, claimed as DreamRefundInput, now);

  if (refundTransactionId) {
    await tx
      .update(dreams)
      .set({ refundTransactionId, updatedAt: now })
      .where(eq(dreams.id, dreamId));
  }
}

/** Marks a still-active dream FAILED (guarded) and refunds it in one transaction. */
async function transitionToFailedAndRefund(
  dreamId: string,
  attemptId: string | null,
  errorCode: string,
): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    const guard = attemptId
      ? and(
          eq(dreams.id, dreamId),
          eq(dreams.processingAttemptId, attemptId),
          eq(dreams.status, DREAM_STATUS.PROCESSING),
        )
      : and(
          eq(dreams.id, dreamId),
          or(
            eq(dreams.status, DREAM_STATUS.PENDING),
            and(eq(dreams.status, DREAM_STATUS.PROCESSING), lt(dreams.processingLeaseExpiresAt, now)),
          ),
        );

    const [failed] = await tx
      .update(dreams)
      .set({
        status: DREAM_STATUS.FAILED,
        failedAt: now,
        lastError: errorCode,
        processingLeaseExpiresAt: null,
        updatedAt: now,
      })
      .where(guard)
      .returning({ id: dreams.id });

    if (!failed) {
      return;
    }

    await claimAndRefund(tx, dreamId, now);
  });
}

export function scheduleDreamProcessing(dreamId: string): void {
  setTimeout(() => {
    void processDream(dreamId, { provider: scheduledProvider }).catch((error: unknown) => {
      logger.error('dream worker failed', { op: 'dream.worker', dreamId, err: serializeError(error) });
      captureDreamProcessingError(error instanceof Error ? error : new Error('Dream worker processing failed.'), {
        dreamId,
        failureClass: 'worker',
      });
    });
  }, DREAM_PROCESSING_CONFIG.PROCESSING_DELAY_MS);
}

export async function processDream(
  dreamId: string,
  options: ProcessDreamOptions = {},
): Promise<void> {
  const completionDelayMs = options.completionDelayMs ?? DREAM_PROCESSING_CONFIG.COMPLETION_DELAY_MS;
  const provider = options.provider ?? defaultProvider;
  const attemptId = randomUUID();
  const claimed = await claimDream(dreamId, attemptId, new Date());

  if (!claimed) {
    await handleUnclaimableDream(dreamId);
    return;
  }

  if (completionDelayMs > 0) {
    await sleep(completionDelayMs);
  }

  const [dream] = await db
    .select({
      id: dreams.id,
      userId: dreams.userId,
      content: dreams.content,
      interpreterId: interpreters.id,
      interpreterName: interpreters.name,
      interpreterSystemPrompt: interpreters.systemPrompt,
      openrouterModelId: aiModels.openrouterModelId,
    })
    .from(dreams)
    .innerJoin(interpreters, eq(dreams.interpreterId, interpreters.id))
    .innerJoin(aiModels, eq(interpreters.modelId, aiModels.id))
    .where(
      and(
        eq(dreams.id, dreamId),
        eq(dreams.processingAttemptId, attemptId),
        eq(dreams.status, DREAM_STATUS.PROCESSING),
      ),
    )
    .limit(1);

  if (!dream) {
    return;
  }

  logger.info('dream interpretation started', { op: 'dream.process', dreamId: dream.id });

  try {
    const result = await provider.interpret({
      dreamId: dream.id,
      userId: dream.userId,
      content: dream.content,
      interpreter: {
        id: dream.interpreterId,
        name: dream.interpreterName,
        systemPrompt: dream.interpreterSystemPrompt,
      },
      model: { openrouterModelId: dream.openrouterModelId },
    });
    const interpretation = sanitizeInterpretation(result.interpretation);

    if (!interpretation) {
      throw new Error('Dream interpretation provider returned empty content.');
    }

    const completedAt = new Date();
    await db
      .update(dreams)
      .set({
        status: DREAM_STATUS.COMPLETED,
        interpretation,
        completedAt,
        processingLeaseExpiresAt: null,
        updatedAt: completedAt,
      })
      .where(
        and(
          eq(dreams.id, dreamId),
          eq(dreams.processingAttemptId, attemptId),
          eq(dreams.status, DREAM_STATUS.PROCESSING),
        ),
      );

    logger.info('dream interpretation succeeded', { op: 'dream.process', dreamId: dream.id });
  } catch (error) {
    logger.error('dream interpretation failed', { op: 'dream.process', dreamId: dream.id, err: serializeError(error) });
    captureDreamProcessingError(error instanceof Error ? error : new Error('Dream provider processing failed.'), {
      dreamId: dream.id,
      userId: dream.userId,
      provider: 'openrouter',
      modelId: dream.openrouterModelId,
      failureClass: 'provider',
      status: error instanceof AppError ? error.statusCode : undefined,
    });

    await transitionToFailedAndRefund(dreamId, attemptId, 'PROVIDER_ERROR');
  }
}

/**
 * A claim can fail for three reasons: the dream is already terminal/held, it has
 * exhausted its attempts (terminalize + refund), or it is FAILED but not yet
 * refunded (finish the refund). This keeps the in-process model free of "stuck"
 * dreams even before the outbox/worker milestone.
 */
async function handleUnclaimableDream(dreamId: string): Promise<void> {
  const now = new Date();
  const [dream] = await db
    .select({
      status: dreams.status,
      attemptCount: dreams.attemptCount,
      refundedAt: dreams.refundedAt,
      leaseExpiresAt: dreams.processingLeaseExpiresAt,
    })
    .from(dreams)
    .where(eq(dreams.id, dreamId))
    .limit(1);

  if (!dream) {
    return;
  }

  const isStuck =
    dream.status === DREAM_STATUS.PENDING ||
    (dream.status === DREAM_STATUS.PROCESSING &&
      dream.leaseExpiresAt !== null &&
      dream.leaseExpiresAt.getTime() < now.getTime());

  if (isStuck && dream.attemptCount >= MAX_ATTEMPTS) {
    await transitionToFailedAndRefund(dreamId, null, 'MAX_ATTEMPTS_EXCEEDED');
    return;
  }

  if (dream.status === DREAM_STATUS.FAILED && dream.refundedAt === null) {
    await db.transaction(async (tx) => {
      await claimAndRefund(tx, dreamId, now);
    });
  }
}

/**
 * Startup/periodic sweeper: re-drives PENDING or lease-expired PROCESSING dreams
 * and settles FAILED-but-unrefunded ones. Safe to run concurrently (every write
 * is guarded).
 */
export async function recoverStuckDreams(): Promise<void> {
  const now = new Date();

  const stuck = await db
    .select({ id: dreams.id })
    .from(dreams)
    .where(
      or(
        eq(dreams.status, DREAM_STATUS.PENDING),
        and(eq(dreams.status, DREAM_STATUS.PROCESSING), lt(dreams.processingLeaseExpiresAt, now)),
      ),
    )
    .limit(100);

  for (const { id } of stuck) {
    await processDream(id, { provider: scheduledProvider });
  }

  const unrefunded = await db
    .select({ id: dreams.id })
    .from(dreams)
    .where(and(eq(dreams.status, DREAM_STATUS.FAILED), isNull(dreams.refundedAt)))
    .limit(100);

  for (const { id } of unrefunded) {
    await db.transaction(async (tx) => {
      await claimAndRefund(tx, id, new Date());
    });
  }
}
