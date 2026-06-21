import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import {
  billingProviderEnum,
  entitlementStatusEnum,
  planEnum,
  storeEnum,
} from '../enums';
import { users } from './auth';

/**
 * Immutable plan/status change history (INSERT + SELECT only). The current
 * effective entitlement lives in user_entitlements; this records every change.
 * user_id is SET NULL on user deletion so the history survives anonymized.
 */
export const entitlementHistory = pgTable(
  'entitlement_history',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    previousPlan: planEnum('previous_plan'),
    newPlan: planEnum('new_plan').notNull(),
    previousStatus: entitlementStatusEnum('previous_status'),
    newStatus: entitlementStatusEnum('new_status').notNull(),
    billingProvider: billingProviderEnum('billing_provider').notNull(),
    store: storeEnum('store'),
    reason: text('reason'),
    effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('entitlement_history_user_created_idx').on(table.userId, table.createdAt),
    index('entitlement_history_effective_idx').on(table.effectiveAt),
  ],
);
