import { and, eq, isNull } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { PLAN } from '../../src/constants/domain';
import { auditLogs, creditTransactions, dreams, userWallets, users } from '../../src/db/schema';
import { ForbiddenError } from '../../src/errors/ForbiddenError';
import { deleteCurrentUser, isSessionFresh } from '../../src/features/users/deletion.service';
import { dreamsService } from '../../src/features/dreams/dreams.service';
import { testDb } from '../helpers/db';
import { createInterpreterFixture, createUserFixture, resetFixtures } from '../helpers/fixtures';
import { setupDatabaseTestFile } from '../helpers/lifecycle';

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

  afterEach(async () => {
    await resetFixtures();
  });
});
