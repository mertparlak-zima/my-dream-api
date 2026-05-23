import { eq } from 'drizzle-orm';
import { db } from '../../db';
import { users } from '../users/users.schema';
import { getNextWeeklyResetDate } from '../../utils/date';
import { NotFoundError } from '../../errors/NotFoundError';
import { serializeUser, type UserResponse } from '../users/users.service';
import type { SyncUserInput } from './auth.schemas';

export const authService = {
  async syncUser(userId: string, input: SyncUserInput): Promise<UserResponse> {
    const now = new Date();
    const updateValues = {
      email: input.email,
      authProvider: input.auth_provider,
      providerId: input.provider_id,
      ...(input.first_name ? { firstName: input.first_name } : {}),
      ...(input.last_name ? { lastName: input.last_name } : {}),
      updatedAt: now,
    };

    await db
      .insert(users)
      .values({
        id: userId,
        email: input.email,
        authProvider: input.auth_provider,
        providerId: input.provider_id,
        firstName: input.first_name ?? null,
        lastName: input.last_name ?? null,
        limitResetDate: getNextWeeklyResetDate(now),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: users.id,
        set: updateValues,
      });

    const syncedUser = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!syncedUser) {
      throw new NotFoundError('Kullanici senkronize edilemedi.');
    }

    return serializeUser(syncedUser);
  },
};
