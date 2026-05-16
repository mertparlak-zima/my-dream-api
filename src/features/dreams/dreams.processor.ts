import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { CREDIT_TRANSACTION_TYPE, DREAM_STATUS } from '../../constants/domain';
import { db } from '../../db';
import { creditTransactions } from '../credits/credits.schema';
import { interpreters } from '../interpreters/interpreters.schema';
import { users } from '../users/users.schema';
import { dreams } from './dreams.schema';

type SpendTransactionType =
  | typeof CREDIT_TRANSACTION_TYPE.USED_WEEKLY
  | typeof CREDIT_TRANSACTION_TYPE.USED_EXTRA;

const SPEND_TRANSACTION_TYPES: SpendTransactionType[] = [
  CREDIT_TRANSACTION_TYPE.USED_WEEKLY,
  CREDIT_TRANSACTION_TYPE.USED_EXTRA,
];

const PROCESSING_DELAY_MS = 300;
const COMPLETION_DELAY_MS = 900;
const MOCK_FAIL_TAG = '[mock-fail]';

function buildMockInterpretation(content: string, interpreterName: string): string {
  const normalizedContent = content.replace(/\s+/g, ' ').trim();
  const excerpt = normalizedContent.length > 220 ? `${normalizedContent.slice(0, 220)}...` : normalizedContent;

  return [
    `${interpreterName} yorumu: Bu ruya, zihninin son donemde islemeye calistigi bir duyguyu sembollerle one cikariyor.`,
    `Ana iz: "${excerpt}" parcasinda guven, merak ve kontrol ihtiyaci ayni anda gorunuyor.`,
    'Pratik okuma: Bugun tek bir karari kucuk bir adima indir ve ruyadaki en guclu imgeyi gunluk notuna ekle.',
  ].join('\n\n');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function scheduleMockDreamProcessing(dreamId: string): void {
  setTimeout(() => {
    void processMockDream(dreamId).catch(
      (error: unknown) => {
        console.error('[DREAM_MOCK_WORKER_ERROR]', error);
      },
    );
  }, PROCESSING_DELAY_MS);
}

export async function processMockDream(
  dreamId: string,
  options?: { completionDelayMs?: number },
): Promise<void> {
  const completionDelayMs = options?.completionDelayMs ?? COMPLETION_DELAY_MS;
  const now = new Date();
  const [processingDream] = await db
    .update(dreams)
    .set({ status: DREAM_STATUS.PROCESSING, updatedAt: now })
    .where(and(eq(dreams.id, dreamId), eq(dreams.status, DREAM_STATUS.PENDING)))
    .returning({ id: dreams.id });

  if (!processingDream) {
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
      interpreterName: interpreters.name,
    })
    .from(dreams)
    .innerJoin(interpreters, eq(dreams.interpreterId, interpreters.id))
    .where(eq(dreams.id, dreamId))
    .limit(1);

  if (!dream || dream.status !== DREAM_STATUS.PROCESSING) {
    return;
  }

  if (dream.content.includes(MOCK_FAIL_TAG)) {
    const [failedDream] = await db
      .update(dreams)
      .set({ status: DREAM_STATUS.FAILED, updatedAt: new Date() })
      .where(and(eq(dreams.id, dreamId), eq(dreams.status, DREAM_STATUS.PROCESSING)))
      .returning({ id: dreams.id });

    if (failedDream) {
      await refundDreamCredit(dream.userId, dreamId);
    }

    return;
  }

  await db
    .update(dreams)
    .set({
      status: DREAM_STATUS.COMPLETED,
      interpretation: buildMockInterpretation(dream.content, dream.interpreterName),
      updatedAt: new Date(),
    })
    .where(and(eq(dreams.id, dreamId), eq(dreams.status, DREAM_STATUS.PROCESSING)));
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
