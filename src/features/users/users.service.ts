import { and, count, eq, type InferSelectModel } from 'drizzle-orm';
import { PLAN_LIMITS } from '../../config';
import type { AuthProvider, Plan } from '../../constants/domain';
import { db } from '../../db';
import { NotFoundError } from '../../errors/NotFoundError';
import { dreams } from '../dreams/dreams.schema';
import { users } from './users.schema';

type UserRow = InferSelectModel<typeof users>;

export type UserResponse = {
  id: string;
  email: string;
  auth_provider: AuthProvider;
  provider_id: string;
  first_name: string | null;
  last_name: string | null;
  plan: Plan;
  weekly_dream_count: number;
  bookmark_count: number;
  weekly_limit: number;
  limit_reset_date: string;
  extra_credits: number;
  created_at: string;
  updated_at: string;
};

export function serializeUser(user: UserRow, bookmarkCount: number): UserResponse {
  return {
    id: user.id,
    email: user.email,
    auth_provider: user.authProvider,
    provider_id: user.providerId,
    first_name: user.firstName,
    last_name: user.lastName,
    plan: user.plan,
    weekly_dream_count: user.weeklyDreamCount,
    bookmark_count: bookmarkCount,
    weekly_limit: PLAN_LIMITS[user.plan],
    limit_reset_date: user.limitResetDate.toISOString(),
    extra_credits: user.extraCredits,
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString(),
  };
}

export async function countUserBookmarks(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(dreams)
    .where(and(eq(dreams.userId, userId), eq(dreams.isBookmarked, true)));

  return row?.value ?? 0;
}

export const usersService = {
  async getCurrentUser(userId: string): Promise<UserResponse> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundError('Kullanici bulunamadi.');
    }

    const bookmarkCount = await countUserBookmarks(userId);
    return serializeUser(user, bookmarkCount);
  },
};
