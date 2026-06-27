import { and, eq, isNull } from 'drizzle-orm';

import { db } from '../../db';
import { users } from '../../db/schema/auth';
import { logger } from '../../utils/logger';
import { addSentryBreadcrumb } from '../../utils/sentry';
import { AUDIT_SOURCE } from '../../constants/domain';
import { writeAudit } from '../audit/audit.service';
import { ensureUserDomainState } from '../credits/credit-engine';
import { usersService, type UserResponse } from '../users/users.service';
import type { BootstrapProfileInput } from './auth.schemas';

export const authService = {
  /**
   * Persists the first/last name captured at first social authorization. Identity
   * and account creation are owned by Better Auth; this only fills the profile
   * name and only while it is still empty (a logged-in user cannot keep
   * overwriting it). Also ensures the user's domain rows exist.
   *
   * Better Auth's built-in `name` column is left empty when Apple omits the name
   * on a returning sign-in, so we keep it in sync with the captured first/last
   * name (only when a non-empty name is provided — never clobbering an existing
   * value with a blank).
   */
  async bootstrapProfile(userId: string, input: BootstrapProfileInput): Promise<UserResponse> {
    const fullName = [input.first_name, input.last_name]
      .map((part) => part?.trim())
      .filter(Boolean)
      .join(' ');

    await db.transaction(async (tx) => {
      await ensureUserDomainState(tx, userId);

      await tx
        .update(users)
        .set({
          firstName: input.first_name ?? null,
          lastName: input.last_name ?? null,
          ...(fullName ? { name: fullName } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(users.id, userId), isNull(users.firstName), isNull(users.lastName)));

      await writeAudit(
        { event: 'PROFILE_BOOTSTRAP', source: AUDIT_SOURCE.api, actorUserId: userId, targetUserId: userId },
        tx,
      );
    });

    logger.info('profile bootstrap', { op: 'auth.bootstrap', userId });
    addSentryBreadcrumb('auth.bootstrap', 'Profile name bootstrapped', { userId });

    return usersService.getCurrentUser(userId);
  },
};
