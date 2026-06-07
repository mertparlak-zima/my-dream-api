import { boolean, index, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const appUpdateTagEnum = pgEnum('app_update_tag', ['new_interpreter', 'new_feature', 'improvement']);

/**
 * "Yenilikler" (Updates) editorial timeline (#47). Content only — the unread
 * indicator is kept app-local (per-device), so there is no server unread state.
 * Per-language content columns (`*_tr`/`*_en`); language-agnostic: slug, tag,
 * isNew, publishedAt. Ships to prod via migration (prod seeding disabled).
 */
export const appUpdates = pgTable(
  'app_updates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: varchar('slug', { length: 80 }).notNull().unique(),
    tag: appUpdateTagEnum('tag').notNull(),
    isNew: boolean('is_new').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),

    titleTr: varchar('title_tr', { length: 200 }).notNull(),
    titleEn: varchar('title_en', { length: 200 }),
    blurbTr: text('blurb_tr'),
    blurbEn: text('blurb_en'),
    mediaTr: text('media_tr'),
    mediaEn: text('media_en'),
    bodyTr: text('body_tr').array(),
    bodyEn: text('body_en').array(),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('app_updates_published_idx').on(table.isActive, table.publishedAt)],
);
