import { symmetricEncrypt } from 'better-auth/crypto';
import { and, eq, isNull } from 'drizzle-orm';

import { exchangeAppleAuthorizationCode } from '../../auth/apple-token';
import { BETTER_AUTH_SECRET } from '../../config';
import { db } from '../../db';
import { accounts, users } from '../../db/schema/auth';
import { logger } from '../../utils/logger';
import { addSentryBreadcrumb } from '../../utils/sentry';
import { AUDIT_SOURCE } from '../../constants/domain';
import { writeAudit } from '../audit/audit.service';
import { ensureUserDomainState } from '../credits/credit-engine';
import { usersService, type UserResponse } from '../users/users.service';
import type { AppleCredentialInput, BootstrapProfileInput } from './auth.schemas';

/** Apple provider id as Better Auth records it in the `accounts` table. */
const APPLE_PROVIDER_ID = 'apple';

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

  /**
   * Captures a revocable Apple refresh token for the signed-in user. The native
   * id-token sign-in path never yields one, so the app forwards the Apple
   * `authorizationCode` (issued fresh on every sign-in) right after login; we
   * exchange it for a refresh token and persist it — encrypted at rest with the
   * same `symmetricEncrypt` Better Auth uses for OAuth tokens — on the linked
   * Apple account row.
   *
   * Why: at account deletion we must revoke this token (App Store Guideline
   * 5.1.1(v)); without it a returning Sign in with Apple never re-shares the
   * email and the user is locked out of re-registering. The fresh-session gate
   * on deletion lines up with this: a deletable session was just authenticated,
   * so the freshest token is already stored.
   *
   * Apple may legitimately omit a refresh token (e.g. nothing to rotate); that
   * is recorded, not synthesized, and account deletion later treats a token-less
   * Apple account as `skipped_no_token` rather than failing.
   */
  async storeAppleRefreshToken(userId: string, input: AppleCredentialInput): Promise<void> {
    const { refreshToken } = await exchangeAppleAuthorizationCode(input.authorization_code);

    if (!refreshToken) {
      logger.warn('apple exchange returned no refresh token', { op: 'auth.apple.credential', userId });
      return;
    }

    const encryptedRefreshToken = await symmetricEncrypt({ key: BETTER_AUTH_SECRET!, data: refreshToken });

    await db
      .update(accounts)
      .set({ refreshToken: encryptedRefreshToken })
      .where(and(eq(accounts.userId, userId), eq(accounts.providerId, APPLE_PROVIDER_ID)));

    logger.info('apple refresh token stored', { op: 'auth.apple.credential', userId });
    addSentryBreadcrumb('auth.apple.credential', 'Apple refresh token stored', { userId });
  },
};
