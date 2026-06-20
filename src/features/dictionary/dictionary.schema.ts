import { boolean, index, integer, pgEnum, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const dictionaryEntryTypeEnum = pgEnum('dictionary_entry_type', ['category', 'symbol', 'theme']);

/**
 * Single dictionary table (#42) holding categories, symbols and themes, with
 * per-language content columns (`*_tr` / `*_en`). Language-agnostic fields
 * (icon, cat, related, slug) are shared. Queries select only the requested
 * language (COALESCE to `tr` as fallback) for performance.
 */
export const dictionaryEntries = pgTable(
  'dictionary_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: dictionaryEntryTypeEnum('type').notNull(),
    // Stable language-agnostic key (e.g. 'su', 'deniz', 'kabuslar').
    slug: varchar('slug', { length: 80 }).notNull().unique(),
    icon: varchar('icon', { length: 60 }).notNull(),
    // Category slug a symbol belongs to (symbols only).
    cat: varchar('cat', { length: 80 }),
    // Display accent color (hex) for categories + themes; symbols inherit their
    // category color client-side, so it stays null for symbols (#68).
    color: varchar('color', { length: 9 }),
    sortOrder: integer('sort_order').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),

    // Per-language content.
    nameTr: varchar('name_tr', { length: 160 }).notNull(),
    nameEn: varchar('name_en', { length: 160 }),
    taglineTr: text('tagline_tr'),
    taglineEn: text('tagline_en'),
    briefTr: text('brief_tr'),
    briefEn: text('brief_en'),
    kwTr: text('kw_tr'),
    kwEn: text('kw_en'),
    spiritualTr: text('spiritual_tr'),
    spiritualEn: text('spiritual_en'),
    psychTr: text('psych_tr'),
    psychEn: text('psych_en'),
    intuitiveTr: text('intuitive_tr'),
    intuitiveEn: text('intuitive_en'),
    // Related entry names (canonical). Language-agnostic for now.
    related: text('related').array(),
    // Precomputed Turkish-FOLDED haystack (name + keywords + brief/tagline) per
    // language. WHY a stored column: SQL LIKE/ILIKE does NOT fold Turkish, so a
    // user typing "yilan" would never match "Yılan" (ı ≠ i) on the raw text
    // columns. Search folds the query terms and matches them against this column
    // with LIKE, so the DB filters fold-correctly and returns only matching rows.
    //
    // MAINTENANCE: when adding/editing a dictionary entry, this column MUST be
    // (re)populated — fold(name + kw + brief/tagline). Via `reference-data.ts`
    // (seed + migration generator) it is computed automatically; if you insert
    // directly (raw SQL / admin), compute the folded text yourself. Put the
    // searchable keywords in `kw_tr`/`kw_en` so they flow into this haystack.
    searchTr: text('search_tr'),
    searchEn: text('search_en'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('dictionary_entries_type_sort_idx').on(table.type, table.sortOrder),
    index('dictionary_entries_cat_idx').on(table.cat),
  ],
);
