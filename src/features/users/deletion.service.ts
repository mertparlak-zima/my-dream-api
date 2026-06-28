import { randomUUID } from 'node:crypto';

import { symmetricDecrypt } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';

import { revokeAppleToken } from '../../auth/apple-token';
import { BETTER_AUTH_SECRET } from '../../config';
import { AUDIT_SOURCE } from '../../constants/domain';
import { db } from '../../db';
import { accounts, users } from '../../db/schema/auth';
import { ForbiddenError } from '../../errors/ForbiddenError';
import { logger } from '../../utils/logger';
import { writeAudit } from '../audit/audit.service';

/** Account deletion requires a recently authenticated session (re-auth gate). */
const FRESH_SESSION_WINDOW_MS = 10 * 60 * 1000;

/** Apple provider id as Better Auth records it in the `accounts` table. */
const APPLE_PROVIDER_ID = 'apple';

type AppleRevokeOutcome = 'revoked' | 'skipped_no_token';

/**
 * Revokes the user's stored Apple refresh token before deletion so the next Sign
 * in with Apple is treated as a fresh authorization (Apple re-shares email/name)
 * — required by App Store Guideline 5.1.1(v) and what unblocks re-registration
 * after deletion.
 *
 * Fail-loud: a stored token whose revocation Apple rejects throws, aborting the
 * deletion (the caller never reaches the delete transaction). A token-less Apple
 * account — every account created before this pipeline, or one whose code
 * exchange did not yield a refresh token — has nothing to revoke; that is
 * recorded as `skipped_no_token` (visible, not a silent fallback) and deletion
 * proceeds so the user's right to erasure is never blocked by a missing token.
 */
async function revokeAppleGrant(userId: string): Promise<AppleRevokeOutcome> {
  const [appleAccount] = await db
    .select({ refreshToken: accounts.refreshToken })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, APPLE_PROVIDER_ID)))
    .limit(1);

  const encryptedRefreshToken = appleAccount?.refreshToken ?? null;
  if (!encryptedRefreshToken) {
    return 'skipped_no_token';
  }

  const refreshToken = await symmetricDecrypt({ key: BETTER_AUTH_SECRET!, data: encryptedRefreshToken });
  await revokeAppleToken(refreshToken, 'refresh_token');

  return 'revoked';
}

export function isSessionFresh(sessionCreatedAt: Date | null, now: Date = new Date()): boolean {
  if (!sessionCreatedAt) {
    return false;
  }
  return now.getTime() - sessionCreatedAt.getTime() <= FRESH_SESSION_WINDOW_MS;
}

/**
 * Permanently deletes the user's account. V1 policy: only allowed with a session
 * created within the last 10 minutes (re-auth gate); the user row is physically
 * deleted, cascading accounts/sessions/preferences/profiles/usage/wallets/dreams,
 * while credit_transactions/entitlement_history/audit_logs keep anonymized rows
 * (FK SET NULL). The deletion audit is written BEFORE the delete (its target FK
 * is then nulled), so it is keyed by a random deletion_request_id, never PII.
 */
export async function deleteCurrentUser(userId: string, sessionCreatedAt: Date | null): Promise<void> {
  if (!isSessionFresh(sessionCreatedAt)) {
    throw new ForbiddenError('Hesabı silmek için lütfen tekrar giriş yapın.');
  }

  // Revoke the Apple grant *before* the delete tx: the account row (and its
  // token) is about to be cascaded away, and a fail-loud revoke must be able to
  // abort the whole deletion without leaving the DB half-changed.
  const appleRevoke = await revokeAppleGrant(userId);

  const deletionRequestId = randomUUID();

  await db.transaction(async (tx) => {
    await writeAudit(
      {
        event: 'ADMIN_ACTION',
        source: AUDIT_SOURCE.api,
        actorUserId: userId,
        targetUserId: userId,
        metadata: { reason: 'account_deletion', deletion_request_id: deletionRequestId, apple_revoke: appleRevoke },
      },
      tx,
    );

    await tx.delete(users).where(eq(users.id, userId));
  });

  logger.info('account deleted', { op: 'user.delete', userId, deletionRequestId, appleRevoke });
}
