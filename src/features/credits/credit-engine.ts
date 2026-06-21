import { and, eq, gte, sql } from 'drizzle-orm';

import { PLAN_LIMITS } from '../../config';
import {
  LEDGER_REASON,
  QUOTA_KEY,
  QUOTA_SOURCE,
  type Plan,
  type QuotaSource,
} from '../../constants/domain';
import { db } from '../../db';
import { userEntitlements, userUsage, userWallets } from '../../db/schema/domain';
import { CreditError } from '../../errors/CreditError';
import { userPreferences } from '../users/user_preferences.schema';
import { creditTransactions } from './credits.schema';
import { getQuotaWindowStart } from './quota-window';

/** Transaction handle taken from `db.transaction(async (tx) => ...)`. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** One dream costs one unit (free quota slot or one wallet coin). */
export const DREAM_COST = 1;

/** The free quota every plan includes; rolls weekly (Monday 00:00 UTC). */
const DREAM_QUOTA_KEY = QUOTA_KEY.weekly_free_dream;

/**
 * Billing trail written onto a dream so a later FAILED dream can be refunded to
 * the exact source that paid for it.
 */
export type DreamCharge = {
  quotaSource: QuotaSource;
  quotaKey: typeof DREAM_QUOTA_KEY | null;
  quotaWindowStartedAt: Date | null;
  quotaUnitsConsumed: number;
  usedCoins: number;
  usedCost: number;
  chargedTransactionId: string | null;
};

/**
 * Lazily provisions the per-user 1:1 domain rows. Idempotent (ON CONFLICT DO
 * NOTHING) and always called at the start of a domain mutation inside the same
 * transaction — never relied upon from an auth hook alone.
 */
export async function ensureUserDomainState(tx: Tx, userId: string): Promise<void> {
  await tx.insert(userEntitlements).values({ userId }).onConflictDoNothing();
  await tx.insert(userWallets).values({ userId }).onConflictDoNothing();
  await tx.insert(userPreferences).values({ userId }).onConflictDoNothing();
}

/**
 * Atomically consumes one dream's cost: tries the plan's weekly quota first via
 * a single rollover+increment+limit upsert, then falls back to an atomic wallet
 * decrement. Writes the wallet ledger row when paid from the wallet. Throws
 * CreditError when neither source can pay. Returns the billing trail to persist
 * on the dream. The dream row must already exist (FK targets).
 */
export async function consumeForDream(
  tx: Tx,
  userId: string,
  plan: Plan,
  dreamId: string,
  now: Date,
): Promise<DreamCharge> {
  const windowStart = getQuotaWindowStart(DREAM_QUOTA_KEY, now);
  const limit = PLAN_LIMITS[plan];

  // Quota path: rollover + increment + limit check in one statement. A returned
  // row means a free slot was consumed; no row means the quota is exhausted.
  const quotaResult = await tx.execute(sql`
    INSERT INTO user_usage (user_id, quota_key, window_started_at, used_count, updated_at)
    VALUES (${userId}, ${DREAM_QUOTA_KEY}, ${windowStart}, 1, ${now})
    ON CONFLICT (user_id, quota_key) DO UPDATE
    SET window_started_at = excluded.window_started_at,
        used_count = CASE
          WHEN user_usage.window_started_at < excluded.window_started_at THEN 1
          ELSE user_usage.used_count + 1
        END,
        updated_at = ${now}
    WHERE user_usage.window_started_at < excluded.window_started_at
       OR (user_usage.window_started_at = excluded.window_started_at AND user_usage.used_count < ${limit})
    RETURNING used_count
  `);

  if (quotaResult.length > 0) {
    return {
      quotaSource: QUOTA_SOURCE.weekly_free,
      quotaKey: DREAM_QUOTA_KEY,
      quotaWindowStartedAt: windowStart,
      quotaUnitsConsumed: DREAM_COST,
      usedCoins: 0,
      usedCost: 0,
      chargedTransactionId: null,
    };
  }

  // Wallet path: guarded atomic decrement (no SELECT-then-write race).
  const [wallet] = await tx
    .update(userWallets)
    .set({ balance: sql`${userWallets.balance} - ${DREAM_COST}`, updatedAt: now })
    .where(and(eq(userWallets.userId, userId), gte(userWallets.balance, DREAM_COST)))
    .returning({ balance: userWallets.balance });

  if (!wallet) {
    throw new CreditError();
  }

  const [charge] = await tx
    .insert(creditTransactions)
    .values({
      userId,
      amount: -DREAM_COST,
      balanceAfter: wallet.balance,
      reason: LEDGER_REASON.dream_charge,
      relatedDreamId: dreamId,
      idempotencyKey: `dream-charge:${dreamId}`,
    })
    .returning({ id: creditTransactions.id });

  return {
    quotaSource: QUOTA_SOURCE.wallet,
    quotaKey: null,
    quotaWindowStartedAt: null,
    quotaUnitsConsumed: 0,
    usedCoins: DREAM_COST,
    usedCost: DREAM_COST,
    chargedTransactionId: charge!.id,
  };
}

/** The persisted billing fields a refund needs (read off the dream row). */
export type DreamRefundInput = {
  id: string;
  userId: string;
  quotaSource: QuotaSource | null;
  quotaKey: typeof DREAM_QUOTA_KEY | null;
  quotaWindowStartedAt: Date | null;
  quotaUnitsConsumed: number;
  usedCoins: number;
};

/**
 * Restores what a FAILED dream consumed, to the exact source. Wallet refunds add
 * a signed ledger row (idempotent via the dream-refund unique index); quota
 * refunds decrement the SAME window only — if the quota already rolled to a new
 * window the user's fresh allowance stands and we no-op. Returns the refund
 * ledger id when a wallet refund was written. Caller must have already claimed
 * the dream (refunded_at guard) inside the same transaction.
 */
export async function refundDream(tx: Tx, dream: DreamRefundInput, now: Date): Promise<string | null> {
  if (dream.quotaSource === QUOTA_SOURCE.wallet) {
    const [wallet] = await tx
      .update(userWallets)
      .set({ balance: sql`${userWallets.balance} + ${dream.usedCoins}`, updatedAt: now })
      .where(eq(userWallets.userId, dream.userId))
      .returning({ balance: userWallets.balance });

    const [refund] = await tx
      .insert(creditTransactions)
      .values({
        userId: dream.userId,
        amount: dream.usedCoins,
        balanceAfter: wallet?.balance ?? dream.usedCoins,
        reason: LEDGER_REASON.dream_processing_refund,
        relatedDreamId: dream.id,
        idempotencyKey: `dream-refund:${dream.id}`,
      })
      .returning({ id: creditTransactions.id });

    return refund!.id;
  }

  if (dream.quotaKey && dream.quotaWindowStartedAt && dream.quotaUnitsConsumed > 0) {
    await tx
      .update(userUsage)
      .set({ usedCount: sql`${userUsage.usedCount} - ${dream.quotaUnitsConsumed}`, updatedAt: now })
      .where(
        and(
          eq(userUsage.userId, dream.userId),
          eq(userUsage.quotaKey, dream.quotaKey),
          eq(userUsage.windowStartedAt, dream.quotaWindowStartedAt),
          gte(userUsage.usedCount, dream.quotaUnitsConsumed),
        ),
      );
  }

  return null;
}
