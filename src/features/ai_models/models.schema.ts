import { boolean, integer, numeric, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { planEnum } from '../../db/enums';

export const aiModels = pgTable('ai_models', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 160 }).notNull(),
  openrouterModelId: varchar('openrouter_model_id', { length: 255 }).notNull().unique(),
  requiredPlan: planEnum('required_plan').notNull().default('FREE'),
  isActive: boolean('is_active').notNull().default(true),
  contextLength: integer('context_length'),
  pricePrompt: numeric('price_prompt', { precision: 12, scale: 8 }),
  priceCompletion: numeric('price_completion', { precision: 12, scale: 8 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
