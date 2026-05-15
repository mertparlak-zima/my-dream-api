import { integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { PLAN } from '../../constants/domain';
import { authProviderEnum, planEnum } from '../../db/enums';

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  authProvider: authProviderEnum('auth_provider').notNull(),
  providerId: varchar('provider_id', { length: 255 }).notNull(),
  firstName: varchar('first_name', { length: 120 }),
  lastName: varchar('last_name', { length: 120 }),
  plan: planEnum('plan').notNull().default(PLAN.FREE),
  weeklyDreamCount: integer('weekly_dream_count').notNull().default(0),
  limitResetDate: timestamp('limit_reset_date', { withTimezone: true }).notNull(),
  extraCredits: integer('extra_credits').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
