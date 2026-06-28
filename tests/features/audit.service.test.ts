import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { auditLogs } from '../../src/db/schema';
import { sanitizeAuditMetadata, writeAudit } from '../../src/features/audit/audit.service';
import { testDb } from '../helpers/db';
import { createUserFixture } from '../helpers/fixtures';
import { setupDatabaseTestFile } from '../helpers/lifecycle';

describe('sanitizeAuditMetadata', () => {
  it('returns null when metadata is absent', () => {
    expect(sanitizeAuditMetadata()).toBeNull();
  });

  it('keeps only whitelisted keys and coerces them to short strings', () => {
    const result = sanitizeAuditMetadata({
      provider: 'apple',
      reason: 'dream_processing_refund',
      // Sensitive / non-whitelisted keys must be dropped.
      token: 'secret-token',
      email: 'user@example.com',
    });

    expect(result).toEqual({ provider: 'apple', reason: 'dream_processing_refund' });
  });

  it('returns null when no whitelisted keys are present', () => {
    expect(sanitizeAuditMetadata({ token: 'x', email: 'y' })).toBeNull();
  });
});

describe('writeAudit', () => {
  setupDatabaseTestFile();

  it('appends an audit row with whitelisted metadata', async () => {
    const user = await createUserFixture();

    await writeAudit({
      event: 'PROFILE_BOOTSTRAP',
      source: 'api',
      actorUserId: user.id,
      targetUserId: user.id,
      metadata: { provider: 'apple', token: 'should-be-dropped' },
    });

    const [row] = await testDb
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.targetUserId, user.id), eq(auditLogs.event, 'PROFILE_BOOTSTRAP')));

    expect(row).toMatchObject({
      event: 'PROFILE_BOOTSTRAP',
      source: 'api',
      actorUserId: user.id,
      targetUserId: user.id,
      metadata: { provider: 'apple' },
    });
  });

  it('writes null metadata and null user ids when omitted', async () => {
    await writeAudit({ event: 'AUTH_FAILURE', source: 'api' });

    const [row] = await testDb
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.event, 'AUTH_FAILURE'));

    expect(row?.actorUserId).toBeNull();
    expect(row?.targetUserId).toBeNull();
    expect(row?.metadata).toBeNull();
  });
});
