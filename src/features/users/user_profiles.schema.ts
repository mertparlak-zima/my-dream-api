import { date, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users.schema';

export const userProfiles = pgTable('user_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  zodiacSign: varchar('zodiac_sign', { length: 80 }),
  birthDate: date('birth_date'),
  birthPlace: varchar('birth_place', { length: 180 }),
  country: varchar('country', { length: 120 }),
  job: varchar('job', { length: 160 }),
  hobbies: text('hobbies'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
