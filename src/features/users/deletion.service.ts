import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { AUDIT_SOURCE } from '../../constants/domain';
import { db } from '../../db';
import { users } from '../../db/schema/auth';
import { ForbiddenError } from '../../errors/ForbiddenError';
import { logger } from '../../utils/logger';
import { writeAudit } from '../audit/audit.service';

/** Account deletion requires a recently authenticated session (re-auth gate). */
const FRESH_SESSION_WINDOW_MS = 10 * 60 * 1000;

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

  const deletionRequestId = randomUUID();

  await db.transaction(async (tx) => {
    await writeAudit(
      {
        event: 'ADMIN_ACTION',
        source: AUDIT_SOURCE.api,
        actorUserId: userId,
        targetUserId: userId,
        metadata: { reason: 'account_deletion', deletion_request_id: deletionRequestId },
      },
      tx,
    );

    await tx.delete(users).where(eq(users.id, userId));
  });

  logger.info('account deleted', { op: 'user.delete', userId, deletionRequestId });
}
