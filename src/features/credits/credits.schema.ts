import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { ledgerReasonEnum } from '../../db/enums';
import { users } from '../../db/schema/auth';
import { dreams } from '../dreams/dreams.schema';

/**
 * Immutable coin ledger (INSERT + SELECT only). Each row is a signed delta with
 * the resulting balance_after. idempotency_key is backend-derived
 * (dream-charge:<dreamId> / dream-refund:<dreamId>), never taken raw from the
 * client. user_id is SET NULL on user deletion (anonymized financial retention).
 */
export const creditTransactions = pgTable(
  'credit_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    amount: integer('amount').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    reason: ledgerReasonEnum('reason').notNull(),
    relatedDreamId: uuid('related_dream_id').references((): AnyPgColumn => dreams.id, {
      onDelete: 'set null',
    }),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('credit_transactions_user_created_at_idx').on(table.userId, table.createdAt.desc()),
    uniqueIndex('credit_transactions_user_idempotency_uq')
      .on(table.userId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    uniqueIndex('credit_transactions_dream_refund_uq')
      .on(table.relatedDreamId)
      .where(sql`${table.reason} = 'dream_processing_refund'`),
    index('credit_transactions_related_dream_id_idx').on(table.relatedDreamId),
    check('credit_transactions_amount_nonzero', sql`${table.amount} <> 0`),
    check('credit_transactions_balance_after_nonneg', sql`${table.balanceAfter} >= 0`),
  ],
);
