import { and, asc, count, eq } from 'drizzle-orm';

import { AUTH_PROVIDER, type AuthProvider } from '../../constants/domain';
import { db } from '../../db';
import { accounts, users } from '../../db/schema/auth';
import { NotFoundError } from '../../errors/NotFoundError';
import { readCredits, type CreditsResponse } from '../credits/credits.service';
import { dreams } from '../dreams/dreams.schema';

export type UserResponse = {
  id: string;
  email: string;
  auth_provider: AuthProvider | null;
  provider_id: string | null;
  first_name: string | null;
  last_name: string | null;
  plan: CreditsResponse['plan'];
  weekly_dream_count: number;
  bookmark_count: number;
  weekly_limit: number;
  limit_reset_date: string;
  extra_credits: number;
  created_at: string;
  updated_at: string;
};

/** Maps a Better Auth `accounts.provider_id` to the app's auth provider enum. */
function mapAuthProvider(providerId: string | null): AuthProvider | null {
  if (providerId === 'google') {
    return AUTH_PROVIDER.GOOGLE;
  }
  if (providerId === 'apple') {
    return AUTH_PROVIDER.APPLE;
  }
  return null;
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
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });

    if (!user) {
      throw new NotFoundError('Kullanici bulunamadi.');
    }

    // Earliest linked social account drives the displayed provider identity.
    const [account] = await db
      .select({ providerId: accounts.providerId, accountId: accounts.accountId })
      .from(accounts)
      .where(eq(accounts.userId, userId))
      .orderBy(asc(accounts.createdAt))
      .limit(1);

    const authProvider = mapAuthProvider(account?.providerId ?? null);
    const credits = await readCredits(userId, new Date());
    const bookmarkCount = await countUserBookmarks(userId);

    return {
      id: user.id,
      email: user.email,
      auth_provider: authProvider,
      provider_id: authProvider ? (account?.accountId ?? null) : null,
      first_name: user.firstName,
      last_name: user.lastName,
      plan: credits.plan,
      weekly_dream_count: credits.weekly_dream_count,
      bookmark_count: bookmarkCount,
      weekly_limit: credits.weekly_limit,
      limit_reset_date: credits.limit_reset_date,
      extra_credits: credits.extra_credits,
      created_at: user.createdAt.toISOString(),
      updated_at: user.updatedAt.toISOString(),
    };
  },
};
