import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { auditEventEnum, auditSourceEnum } from '../enums';
import { users } from './auth';

/**
 * Lightweight, append-only security/operations trail. NOT an integrity source —
 * financial/entitlement truth lives in credit_transactions / entitlement_history.
 * metadata is a whitelisted, size-capped jsonb (never tokens/email/receipts).
 * Both actor and target FKs SET NULL on user deletion so the trail survives.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'set null' }),
    event: auditEventEnum('event').notNull(),
    source: auditSourceEnum('source').notNull(),
    requestId: text('request_id'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_target_created_idx').on(table.targetUserId, table.createdAt),
    index('audit_logs_event_created_idx').on(table.event, table.createdAt),
  ],
);
