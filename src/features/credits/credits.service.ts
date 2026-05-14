import { eq } from 'drizzle-orm';
import { PLAN_LIMITS } from '../../config';
import type { Plan } from '../../constants/domain';
import { db } from '../../db';
import { NotFoundError } from '../../errors/NotFoundError';
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
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundError('Kullanici bulunamadi.');
    }

    const weeklyLimit = PLAN_LIMITS[user.plan];

    return {
      plan: user.plan,
      weekly_dream_count: user.weeklyDreamCount,
      weekly_limit: weeklyLimit,
      weekly_remaining: Math.max(weeklyLimit - user.weeklyDreamCount, 0),
      extra_credits: user.extraCredits,
      limit_reset_date: user.limitResetDate.toISOString(),
    };
  },
};
