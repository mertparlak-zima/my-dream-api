import { and, eq, lte } from 'drizzle-orm';
import { PLAN_LIMITS } from '../../config';
import type { Plan } from '../../constants/domain';
import { db } from '../../db';
import { NotFoundError } from '../../errors/NotFoundError';
import { getNextWeeklyResetDate } from '../../utils/date';
import { users } from '../users/users.schema';

export type CreditsResponse = {
  plan: Plan;
  weekly_dream_count: number;
  weekly_limit: number;
  weekly_remaining: number;
  extra_credits: number;
  limit_reset_date: string;
};

export const creditsService = {
  async getCurrentCredits(userId: string): Promise<CreditsResponse> {
    return db.transaction(async (tx) => {
      const now = new Date();

      await tx
        .update(users)
        .set({
          weeklyDreamCount: 0,
          limitResetDate: getNextWeeklyResetDate(now),
          updatedAt: now,
        })
        .where(and(eq(users.id, userId), lte(users.limitResetDate, now)));

      const [currentUser] = await tx
        .select({
          plan: users.plan,
          weeklyDreamCount: users.weeklyDreamCount,
          extraCredits: users.extraCredits,
          limitResetDate: users.limitResetDate,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!currentUser) {
        throw new NotFoundError('Kullanici bulunamadi.');
      }

      const weeklyLimit = PLAN_LIMITS[currentUser.plan];

      return {
        plan: currentUser.plan,
        weekly_dream_count: currentUser.weeklyDreamCount,
        weekly_limit: weeklyLimit,
        weekly_remaining: Math.max(weeklyLimit - currentUser.weeklyDreamCount, 0),
        extra_credits: currentUser.extraCredits,
        limit_reset_date: currentUser.limitResetDate.toISOString(),
      };
    });
  },
};
