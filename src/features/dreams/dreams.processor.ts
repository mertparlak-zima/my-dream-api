import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { DREAM_PROCESSING_CONFIG } from '../../config';
import { CREDIT_TRANSACTION_TYPE, DREAM_STATUS } from '../../constants/domain';
import { db } from '../../db';
import { AppError } from '../../errors/AppError';
import { captureDreamProcessingError } from '../../utils/sentry';
import { aiModels } from '../ai_models/models.schema';
import { creditTransactions } from '../credits/credits.schema';
import { interpreters } from '../interpreters/interpreters.schema';
import { users } from '../users/users.schema';
import { dreams } from './dreams.schema';
import type { DreamInterpretationProvider } from './dreams.provider';
import { OpenRouterDreamInterpretationProvider } from './openrouter.provider';

type SpendTransactionType =
  | typeof CREDIT_TRANSACTION_TYPE.USED_WEEKLY
  | typeof CREDIT_TRANSACTION_TYPE.USED_EXTRA;

export type ProcessDreamOptions = {
  completionDelayMs?: number;
  provider?: DreamInterpretationProvider;
};

const SPEND_TRANSACTION_TYPES: SpendTransactionType[] = [
  CREDIT_TRANSACTION_TYPE.USED_WEEKLY,
  CREDIT_TRANSACTION_TYPE.USED_EXTRA,
];

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
    .split('\u0000').join('')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (normalized.length <= DREAM_PROCESSING_CONFIG.MAX_INTERPRETATION_LENGTH) {
    return normalized;
  }

  return normalized.slice(0, DREAM_PROCESSING_CONFIG.MAX_INTERPRETATION_LENGTH).trimEnd();
}

export function scheduleDreamProcessing(dreamId: string): void {
  setTimeout(() => {
    void processDream(dreamId, { provider: scheduledProvider }).catch((error: unknown) => {
      console.error('[DREAM_WORKER_ERROR]', error);
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
  const now = new Date();
  const [processingDream] = await db
    .update(dreams)
    .set({ status: DREAM_STATUS.PROCESSING, updatedAt: now })
    .where(and(eq(dreams.id, dreamId), eq(dreams.status, DREAM_STATUS.PENDING)))
    .returning({ id: dreams.id });

  if (!processingDream) {
    const [existingDream] = await db
      .select({
        status: dreams.status,
        userId: dreams.userId,
      })
      .from(dreams)
      .where(eq(dreams.id, dreamId))
      .limit(1);

    if (existingDream?.status === DREAM_STATUS.FAILED) {
      await refundDreamCredit(existingDream.userId, dreamId);
    }

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
      status: dreams.status,
      interpreterId: interpreters.id,
      interpreterName: interpreters.name,
      interpreterSystemPrompt: interpreters.systemPrompt,
      openrouterModelId: aiModels.openrouterModelId,
    })
    .from(dreams)
    .innerJoin(interpreters, eq(dreams.interpreterId, interpreters.id))
    .innerJoin(aiModels, eq(interpreters.modelId, aiModels.id))
    .where(eq(dreams.id, dreamId))
    .limit(1);

  if (!dream || dream.status !== DREAM_STATUS.PROCESSING) {
    return;
  }

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
      model: {
        openrouterModelId: dream.openrouterModelId,
      },
    });
    const interpretation = sanitizeInterpretation(result.interpretation);

    if (!interpretation) {
      throw new Error('Dream interpretation provider returned empty content.');
    }

    await db
      .update(dreams)
      .set({
        status: DREAM_STATUS.COMPLETED,
        interpretation,
        updatedAt: new Date(),
      })
      .where(and(eq(dreams.id, dreamId), eq(dreams.status, DREAM_STATUS.PROCESSING)));
  } catch (error) {
    console.error('[DREAM_PROVIDER_ERROR]', error);
    captureDreamProcessingError(error instanceof Error ? error : new Error('Dream provider processing failed.'), {
      dreamId: dream.id,
      userId: dream.userId,
      provider: 'openrouter',
      modelId: dream.openrouterModelId,
      failureClass: 'provider',
      status: error instanceof AppError ? error.statusCode : undefined,
    });

    const [failedDream] = await db
      .update(dreams)
      .set({
        status: DREAM_STATUS.FAILED,
        updatedAt: new Date(),
      })
      .where(and(eq(dreams.id, dreamId), eq(dreams.status, DREAM_STATUS.PROCESSING)))
      .returning({ id: dreams.id, userId: dreams.userId });

    if (failedDream) {
      await refundDreamCredit(failedDream.userId, dreamId);
    }
  }
}

async function refundDreamCredit(userId: string, dreamId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [existingRefund] = await tx
      .select({ id: creditTransactions.id })
      .from(creditTransactions)
      .where(and(
        eq(creditTransactions.relatedDreamId, dreamId),
        eq(creditTransactions.transactionType, CREDIT_TRANSACTION_TYPE.REFUNDED),
      ))
      .limit(1);

    if (existingRefund) {
      return;
    }

    const [spend] = await tx
      .select({ transactionType: creditTransactions.transactionType })
      .from(creditTransactions)
      .where(
        and(
          eq(creditTransactions.userId, userId),
          eq(creditTransactions.relatedDreamId, dreamId),
          inArray(creditTransactions.transactionType, SPEND_TRANSACTION_TYPES),
        ),
      )
      .orderBy(desc(creditTransactions.createdAt))
      .limit(1);

    if (!spend) {
      return;
    }

    await tx.insert(creditTransactions).values({
      userId,
      transactionType: CREDIT_TRANSACTION_TYPE.REFUNDED,
      amount: 1,
      relatedDreamId: dreamId,
    });

    if (spend.transactionType === CREDIT_TRANSACTION_TYPE.USED_WEEKLY) {
      await tx
        .update(users)
        .set({
          weeklyDreamCount: sql<number>`greatest(${users.weeklyDreamCount} - 1, 0)`,
          updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
      return;
    }

    await tx
      .update(users)
      .set({
        extraCredits: sql<number>`${users.extraCredits} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  });
}
