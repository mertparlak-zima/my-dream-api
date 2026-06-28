import { symmetricEncrypt } from 'better-auth/crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BETTER_AUTH_SECRET } from '../../src/config';
import { AUTH_PROVIDER, PLAN } from '../../src/constants/domain';
import { accounts, auditLogs, creditTransactions, dreams, userWallets, users } from '../../src/db/schema';
import { AppleTokenError } from '../../src/errors/AppleTokenError';
import { ForbiddenError } from '../../src/errors/ForbiddenError';
import { deleteCurrentUser, isSessionFresh } from '../../src/features/users/deletion.service';
import { dreamsService } from '../../src/features/dreams/dreams.service';
import { testDb } from '../helpers/db';
import { createInterpreterFixture, createUserFixture, resetFixtures } from '../helpers/fixtures';
import { setupDatabaseTestFile } from '../helpers/lifecycle';

vi.mock('../../src/auth/apple-token', () => ({
  exchangeAppleAuthorizationCode: vi.fn(),
  revokeAppleToken: vi.fn(),
}));

import { revokeAppleToken } from '../../src/auth/apple-token';

const revokeMock = vi.mocked(revokeAppleToken);

/** Encrypts a raw Apple refresh token the same way the credential exchange does. */
async function storeEncryptedAppleToken(userId: string, rawToken: string): Promise<void> {
  const data = await symmetricEncrypt({ key: BETTER_AUTH_SECRET!, data: rawToken });
  await testDb
    .update(accounts)
    .set({ refreshToken: data })
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'apple')));
}

async function readDeletionAudit(): Promise<Record<string, unknown> | null> {
  const [audit] = await testDb
    .select({ metadata: auditLogs.metadata })
    .from(auditLogs)
    .where(and(eq(auditLogs.event, 'ADMIN_ACTION'), isNull(auditLogs.targetUserId)));

  return (audit?.metadata as Record<string, unknown> | undefined) ?? null;
}

/** The anonymized deletion audit row has a null target, so resetFixtures (which
 * only tracks created fixtures) cannot reclaim it — clean it explicitly. */
async function cleanupAnonymizedAudit(): Promise<void> {
  await testDb.delete(auditLogs).where(isNull(auditLogs.targetUserId));
}

describe('isSessionFresh', () => {
  it('accepts a session created within the freshness window', () => {
    expect(isSessionFresh(new Date(Date.now() - 60_000))).toBe(true);
  });

  it('rejects a null or stale session', () => {
    expect(isSessionFresh(null)).toBe(false);
    expect(isSessionFresh(new Date(Date.now() - 60 * 60 * 1000))).toBe(false);
  });
});

describe('deleteCurrentUser', () => {
  setupDatabaseTestFile();

  beforeEach(() => {
    revokeMock.mockReset();
    revokeMock.mockResolvedValue(undefined);
  });

  it('refuses deletion without a fresh session and keeps the user', async () => {
    const user = await createUserFixture();

    await expect(deleteCurrentUser(user.id, null)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      deleteCurrentUser(user.id, new Date(Date.now() - 60 * 60 * 1000)),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const stillThere = await testDb.query.users.findFirst({ where: eq(users.id, user.id) });
    expect(stillThere).toBeTruthy();
  });

  it('physically deletes the user, cascades domain rows, and keeps an anonymized ledger + audit', async () => {
    // Wallet-paid dream so a ledger row exists to verify SET-NULL anonymization.
    const user = await createUserFixture({ plan: PLAN.FREE, weeklyDreamCount: 1, extraCredits: 1 });
    const interpreter = await createInterpreterFixture();
    const dream = await dreamsService.createDream(user.id, {
      content: 'vitest: dream before account deletion',
      interpreter_id: interpreter.id,
      client_request_id: crypto.randomUUID(),
    });

    await deleteCurrentUser(user.id, new Date());

    // User + cascaded 1:1 rows + dreams are gone.
    expect(await testDb.query.users.findFirst({ where: eq(users.id, user.id) })).toBeUndefined();
    expect(await testDb.query.userWallets.findFirst({ where: eq(userWallets.userId, user.id) })).toBeUndefined();
    expect(await testDb.query.dreams.findFirst({ where: eq(dreams.id, dream.id) })).toBeUndefined();

    // The charge ledger row survives, anonymized (user_id nulled).
    const [ledger] = await testDb
      .select({ userId: creditTransactions.userId })
      .from(creditTransactions)
      .where(isNull(creditTransactions.userId));
    expect(ledger).toBeTruthy();

    // The deletion audit row survives (target nulled), keyed by deletion_request_id.
    const [audit] = await testDb
      .select({ metadata: auditLogs.metadata, targetUserId: auditLogs.targetUserId })
      .from(auditLogs)
      .where(and(eq(auditLogs.event, 'ADMIN_ACTION'), isNull(auditLogs.targetUserId)));
    expect(audit?.metadata).toMatchObject({ reason: 'account_deletion' });
    expect((audit?.metadata as { deletion_request_id?: string })?.deletion_request_id).toBeTruthy();

    // Cleanup the anonymized leftovers this test intentionally created.
    await testDb.delete(creditTransactions).where(isNull(creditTransactions.userId));
    await testDb.delete(auditLogs).where(isNull(auditLogs.targetUserId));
  });

  it('revokes the stored Apple grant before deleting and records apple_revoke=revoked', async () => {
    const user = await createUserFixture({ authProvider: AUTH_PROVIDER.APPLE });
    await storeEncryptedAppleToken(user.id, 'apple-refresh-token');

    await deleteCurrentUser(user.id, new Date());

    // Apple grant revoked with the decrypted token + correct hint (App Store 5.1.1(v)).
    expect(revokeMock).toHaveBeenCalledWith('apple-refresh-token', 'refresh_token');
    expect(await testDb.query.users.findFirst({ where: eq(users.id, user.id) })).toBeUndefined();
    expect(await readDeletionAudit()).toMatchObject({ reason: 'account_deletion', apple_revoke: 'revoked' });

    await cleanupAnonymizedAudit();
  });

  it('fails loud and keeps the user when Apple rejects the revocation', async () => {
    const user = await createUserFixture({ authProvider: AUTH_PROVIDER.APPLE });
    await storeEncryptedAppleToken(user.id, 'apple-refresh-token');
    revokeMock.mockRejectedValue(new AppleTokenError());

    await expect(deleteCurrentUser(user.id, new Date())).rejects.toBeInstanceOf(AppleTokenError);

    // Deletion aborted before the tx: the user (and no anonymized audit) remains.
    expect(await testDb.query.users.findFirst({ where: eq(users.id, user.id) })).toBeTruthy();
    expect(await readDeletionAudit()).toBeNull();
  });

  it('skips revocation for a token-less Apple account and records skipped_no_token', async () => {
    const user = await createUserFixture({ authProvider: AUTH_PROVIDER.APPLE });

    await deleteCurrentUser(user.id, new Date());

    expect(revokeMock).not.toHaveBeenCalled();
    expect(await testDb.query.users.findFirst({ where: eq(users.id, user.id) })).toBeUndefined();
    expect(await readDeletionAudit()).toMatchObject({ apple_revoke: 'skipped_no_token' });

    await cleanupAnonymizedAudit();
  });

  afterEach(async () => {
    await resetFixtures();
  });
});
