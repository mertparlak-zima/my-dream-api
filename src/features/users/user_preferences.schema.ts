import { pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { DEFAULT_LANGUAGE, DEFAULT_TEXT_SIZE } from '../../constants/domain';
import { languageEnum, textSizeEnum } from '../../db/enums';
import { users } from '../../db/schema/auth';

/**
 * Per-user UI preferences (de-dummy #48). 1:1 with users; a row is created
 * lazily on the first PATCH. When absent, the API serves the column defaults.
 * Device-only settings (e.g. reduce-motion) are intentionally NOT stored here.
 */
export const userPreferences = pgTable('user_preferences', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  textSize: textSizeEnum('text_size').notNull().default(DEFAULT_TEXT_SIZE),
  language: languageEnum('language').notNull().default(DEFAULT_LANGUAGE),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
