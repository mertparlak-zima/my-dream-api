import { db } from '../../db';
import { users } from '../users/users.schema';
import { getNextWeeklyResetDate } from '../../utils/date';
import { NotFoundError } from '../../errors/NotFoundError';
import { serializeUser, type UserResponse } from '../users/users.service';
import { logger, serializeError } from '../../utils/logger';
import { addSentryBreadcrumb } from '../../utils/sentry';
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

    try {
      const [syncedUser] = await db
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
        })
        .returning();

      if (!syncedUser) {
        throw new NotFoundError('Kullanici senkronize edilemedi.');
      }

      logger.info('auth sync succeeded', { op: 'auth.sync', userId, authProvider: input.auth_provider });
      addSentryBreadcrumb('auth.sync', 'Supabase user synced', {
        authProvider: input.auth_provider,
        userId,
      });

      return serializeUser(syncedUser);
    } catch (error) {
      logger.error('auth sync failed', { op: 'auth.sync', userId, err: serializeError(error) });
      addSentryBreadcrumb('auth.sync', 'Supabase user sync failed', {
        authProvider: input.auth_provider,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        userId,
      }, 'error');

      throw error;
    }
  },
};
