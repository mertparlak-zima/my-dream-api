import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { dreamStatusEnum } from '../../db/enums';
import { interpreters } from '../interpreters/interpreters.schema';
import { users } from '../users/users.schema';

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
    status: dreamStatusEnum('status').notNull().default('PENDING'),
    userRating: integer('user_rating'),
    userFeedbackText: text('user_feedback_text'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('dreams_user_created_at_idx').on(table.userId, table.createdAt),
    index('dreams_user_status_idx').on(table.userId, table.status),
    index('dreams_interpreter_id_idx').on(table.interpreterId),
  ],
);
