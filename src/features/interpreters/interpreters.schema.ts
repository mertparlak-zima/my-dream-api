import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { aiModels } from '../ai_models/models.schema';

export type InterpreterSampleRow = { ctx: string; quote: string };

export const interpreters = pgTable(
  'interpreters',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 140 }).notNull(),
    description: text('description').notNull(),
    systemPrompt: text('system_prompt').notNull(),
    imageUrl: varchar('image_url', { length: 500 }),
    isPremium: boolean('is_premium').notNull().default(false),
    modelId: uuid('model_id')
      .notNull()
      .references(() => aiModels.id, { onDelete: 'restrict' }),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    // Enrichment (#41): rating/reviews/styles/story/samples (Turkish content,
    // single-language like name/description). Nullable so non-enriched rows work.
    rating: numeric('rating', { precision: 2, scale: 1 }),
    reviews: integer('reviews').notNull().default(0),
    styles: text('styles').array(),
    story: text('story'),
    samples: jsonb('samples').$type<InterpreterSampleRow[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('interpreters_active_sort_idx').on(table.isActive, table.sortOrder),
    index('interpreters_model_id_idx').on(table.modelId),
  ],
);
