import { db } from '../../db';
import { auditLogs } from '../../db/schema/audit';
import type { AuditEvent, AuditSource } from '../../constants/domain';

/** db handle or an open transaction (so audit rows join the caller's tx). */
type Inserter = Pick<typeof db, 'insert'>;

/**
 * Metadata is a deliberately small whitelist of non-sensitive keys. Never log
 * tokens, emails, receipts, cookies or auth headers (see Sentry scrubber).
 */
const METADATA_WHITELIST = [
  'provider',
  'reason',
  'deletion_request_id',
  'previous_plan',
  'new_plan',
  'apple_revoke',
] as const;
const MAX_METADATA_KEYS = METADATA_WHITELIST.length;

export type AuditInput = {
  event: AuditEvent;
  source: AuditSource;
  actorUserId?: string | null;
  targetUserId?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

export function sanitizeAuditMetadata(metadata?: Record<string, unknown>): Record<string, string> | null {
  if (!metadata) {
    return null;
  }

  const safe: Record<string, string> = {};
  for (const key of METADATA_WHITELIST) {
    const value = metadata[key];
    if (value === undefined || value === null) {
      continue;
    }
    // Coerce to a short string; the whitelist already bounds the key count.
    safe[key] = String(value).slice(0, 256);
  }

  return Object.keys(safe).length > 0 ? safe : null;
}

/**
 * Appends a lightweight audit row. Best-effort and append-only: callers pass a
 * transaction when the audit must be atomic with a domain change, otherwise the
 * top-level db handle is used. Whitelisted/size-capped metadata only.
 */
export async function writeAudit(input: AuditInput, inserter: Inserter = db): Promise<void> {
  await inserter.insert(auditLogs).values({
    event: input.event,
    source: input.source,
    actorUserId: input.actorUserId ?? null,
    targetUserId: input.targetUserId ?? null,
    requestId: input.requestId ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    metadata: sanitizeAuditMetadata(input.metadata),
  });
}

export { MAX_METADATA_KEYS };
