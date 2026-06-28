import { and, eq } from 'drizzle-orm';

import { PLAN_LIMITS } from '../../config';
import { PLAN, QUOTA_KEY, type Plan } from '../../constants/domain';
import { db } from '../../db';
import { userEntitlements, userUsage, userWallets } from '../../db/schema/domain';
import { getWeekStartUtc } from './quota-window';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type CreditsResponse = {
  plan: Plan;
  weekly_dream_count: number;
  weekly_limit: number;
  weekly_remaining: number;
  extra_credits: number;
  limit_reset_date: string;
};

/**
 * Reads the user's effective credit state from the decomposed domain tables.
 * Missing 1:1 rows fall back to defaults (no provisioning on this read path).
 * The weekly count is the usage row only when its window is the current week;
 * an older window means the quota already rolled and the effective count is 0.
 */
async function readCredits(userId: string, now: Date): Promise<CreditsResponse> {
  const weekStart = getWeekStartUtc(now);

  const [entitlement] = await db
    .select({ plan: userEntitlements.plan })
    .from(userEntitlements)
    .where(eq(userEntitlements.userId, userId))
    .limit(1);
  const plan = entitlement?.plan ?? PLAN.FREE;

  const [wallet] = await db
    .select({ balance: userWallets.balance })
    .from(userWallets)
    .where(eq(userWallets.userId, userId))
    .limit(1);
  const extraCredits = wallet?.balance ?? 0;

  const [usage] = await db
    .select({ usedCount: userUsage.usedCount, windowStartedAt: userUsage.windowStartedAt })
    .from(userUsage)
    .where(and(eq(userUsage.userId, userId), eq(userUsage.quotaKey, QUOTA_KEY.weekly_free_dream)))
    .limit(1);
  const weeklyDreamCount =
    usage && usage.windowStartedAt.getTime() >= weekStart.getTime() ? usage.usedCount : 0;

  const weeklyLimit = PLAN_LIMITS[plan];
  const limitResetDate = new Date(weekStart.getTime() + WEEK_MS);

  return {
    plan,
    weekly_dream_count: weeklyDreamCount,
    weekly_limit: weeklyLimit,
    weekly_remaining: Math.max(weeklyLimit - weeklyDreamCount, 0),
    extra_credits: extraCredits,
    limit_reset_date: limitResetDate.toISOString(),
  };
}

export const creditsService = {
  async getCurrentCredits(userId: string): Promise<CreditsResponse> {
    return readCredits(userId, new Date());
  },
};

export { readCredits };
