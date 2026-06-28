import { sql } from 'drizzle-orm';
import { check, integer, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';

import { PLAN } from '../../constants/domain';
import {
  billingProviderEnum,
  entitlementStatusEnum,
  planEnum,
  quotaKeyEnum,
  storeEnum,
} from '../enums';
import { users } from './auth';

/**
 * Active billing entitlement (current plan / premium state). One row per user,
 * lazily provisioned by ensureUserDomainState. Backend/webhook owned only.
 */
export const userEntitlements = pgTable('user_entitlements', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  plan: planEnum('plan').notNull().default(PLAN.FREE),
  status: entitlementStatusEnum('status').notNull().default('active'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  billingProvider: billingProviderEnum('billing_provider').notNull().default('free'),
  store: storeEnum('store'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Free-tier usage quota window. Keyed by (user, quota_key); the window rolls
 * forward server-side (no cron). used_count is bumped atomically on consumption.
 */
export const userUsage = pgTable(
  'user_usage',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    quotaKey: quotaKeyEnum('quota_key').notNull(),
    windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
    usedCount: integer('used_count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.quotaKey] }),
    check('user_usage_used_count_nonneg', sql`${table.usedCount} >= 0`),
  ],
);

/**
 * Coin wallet (mutable current balance). Mutated only via atomic guarded UPDATEs
 * inside the same transaction that writes the credit_transactions ledger row.
 */
export const userWallets = pgTable(
  'user_wallets',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    balance: integer('balance').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('user_wallets_balance_nonneg', sql`${table.balance} >= 0`)],
);
