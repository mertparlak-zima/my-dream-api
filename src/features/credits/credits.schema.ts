import { index, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { creditTransactionTypeEnum } from '../../db/enums';
import { dreams } from '../dreams/dreams.schema';
import { users } from '../users/users.schema';

export const creditTransactions = pgTable(
  'credit_transactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    transactionType: creditTransactionTypeEnum('transaction_type').notNull(),
    amount: integer('amount').notNull(),
    relatedDreamId: uuid('related_dream_id').references(() => dreams.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('credit_transactions_user_created_at_idx').on(table.userId, table.createdAt),
    index('credit_transactions_related_dream_id_idx').on(table.relatedDreamId),
  ],
);
