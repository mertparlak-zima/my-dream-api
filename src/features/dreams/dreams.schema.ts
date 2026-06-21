import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  char,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { DREAM_STATUS } from '../../constants/domain';
import { dreamStatusEnum, quotaKeyEnum, quotaSourceEnum } from '../../db/enums';
import { users } from '../../db/schema/auth';
// Circular FK (dreams <-> credit_transactions): safe because both sides only use
// the lazy `() => table.id` callback form, so ESM live bindings resolve in time.
import { creditTransactions } from '../credits/credits.schema';
import { interpreters } from '../interpreters/interpreters.schema';

export const dreams = pgTable(
  'dreams',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    interpreterId: uuid('interpreter_id')
      .notNull()
      .references(() => interpreters.id, { onDelete: 'restrict' }),
    content: text('content').notNull(),
    interpretation: text('interpretation'),
    status: dreamStatusEnum('status').notNull().default(DREAM_STATUS.PENDING),
    userRating: integer('user_rating'),
    userFeedbackText: text('user_feedback_text'),
    isBookmarked: boolean('is_bookmarked').notNull().default(false),

    // Idempotency: a stable client id + an immutable-payload hash. A retry with
    // the same client_request_id returns the original dream; a different hash for
    // the same key is rejected (409). request_hash hashes only the client payload
    // (dreamText/interpreterId/language), never mutable server state.
    clientRequestId: uuid('client_request_id').notNull(),
    requestHash: char('request_hash', { length: 64 }).notNull(),

    // Recovery / lease: claims and heartbeats are guarded by processing_attempt_id
    // so a stale worker can never overwrite a newer attempt's result.
    queuedAt: timestamp('queued_at', { withTimezone: true }),
    processingStartedAt: timestamp('processing_started_at', { withTimezone: true }),
    processingAttemptId: uuid('processing_attempt_id'),
    processingLeaseExpiresAt: timestamp('processing_lease_expires_at', { withTimezone: true }),
    attemptCount: integer('attempt_count').notNull().default(0),
    lastError: text('last_error'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    failedAt: timestamp('failed_at', { withTimezone: true }),

    // Billing trail: which source paid for this dream so a FAILED dream can be
    // refunded to the correct place. quota_window_started_at pins the exact usage
    // window so a refund never decrements a newer week's quota.
    quotaSource: quotaSourceEnum('quota_source'),
    quotaKey: quotaKeyEnum('quota_key'),
    quotaWindowStartedAt: timestamp('quota_window_started_at', { withTimezone: true }),
    quotaUnitsConsumed: smallint('quota_units_consumed').notNull().default(0),
    usedCoins: integer('used_coins').notNull().default(0),
    usedCost: integer('used_cost').notNull().default(0),
    chargedTransactionId: uuid('charged_transaction_id').references(
      (): AnyPgColumn => creditTransactions.id,
      { onDelete: 'restrict' },
    ),
    refundTransactionId: uuid('refund_transaction_id').references(
      (): AnyPgColumn => creditTransactions.id,
      { onDelete: 'restrict' },
    ),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('dreams_user_created_at_idx').on(table.userId, table.createdAt.desc()),
    index('dreams_user_status_idx').on(table.userId, table.status),
    index('dreams_user_bookmarked_created_at_idx').on(table.userId, table.isBookmarked, table.createdAt),
    index('dreams_interpreter_id_idx').on(table.interpreterId),
    uniqueIndex('dreams_user_client_request_uq').on(table.userId, table.clientRequestId),
    index('dreams_pending_recovery_idx').on(table.queuedAt).where(sql`${table.status} = 'PENDING'`),
    index('dreams_processing_lease_idx')
      .on(table.processingLeaseExpiresAt)
      .where(sql`${table.status} = 'PROCESSING'`),
    check('dreams_attempt_count_nonneg', sql`${table.attemptCount} >= 0`),
    check('dreams_quota_units_nonneg', sql`${table.quotaUnitsConsumed} >= 0`),
    check('dreams_used_coins_nonneg', sql`${table.usedCoins} >= 0`),
    check('dreams_used_cost_nonneg', sql`${table.usedCost} >= 0`),
    check('dreams_completed_at_present', sql`${table.status} <> 'COMPLETED' OR ${table.completedAt} IS NOT NULL`),
    check('dreams_failed_at_present', sql`${table.status} <> 'FAILED' OR ${table.failedAt} IS NOT NULL`),
  ],
);
