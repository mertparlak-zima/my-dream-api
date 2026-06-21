/**
 * Emits the SQL for the reference-data migration (default model, interpreters +
 * enrichment, dream dictionary) from the single source of truth
 * (`src/db/reference-data.ts`). Run it and paste the output into the custom
 * data migration so the same data ships to prod via `db:migrate` (prod seeding
 * is disabled). Regenerate into a NEW migration when the content changes.
 *
 *   bun scripts/generate-reference-migration.ts
 */
import {
  DEFAULT_MODEL_ID,
  REFERENCE_INTERPRETERS,
  REFERENCE_MODEL,
  REFERENCE_UPDATES,
  buildDictionaryRows,
} from '../src/db/reference-data';

// Pass a section to emit only part of the data, e.g.:
//   bun scripts/generate-reference-migration.ts updates
const only = process.argv[2];

function q(value: string | null): string {
  return value === null ? 'NULL' : `'${value.replace(/'/g, "''")}'`;
}

function textArray(value: string[] | null): string {
  if (value === null) {
    return 'NULL';
  }
  if (value.length === 0) {
    return `ARRAY[]::text[]`;
  }
  return `ARRAY[${value.map(q).join(', ')}]::text[]`;
}

function jsonb(value: unknown): string {
  return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
}

const statements: string[] = [];

// Updates-only section (separate data migration).
if (only === 'updates') {
  for (const u of REFERENCE_UPDATES) {
    statements.push(
      `INSERT INTO "app_updates" ("slug", "tag", "is_new", "published_at", "title_tr", "blurb_tr", "media_tr", "body_tr")\n` +
        `VALUES (${q(u.slug)}, ${q(u.tag)}, ${u.isNew}, ${q(u.publishedAt.toISOString())}, ${q(u.titleTr)}, ${q(u.blurbTr)}, ${q(u.mediaTr)}, ${textArray(u.bodyTr)})\n` +
        `ON CONFLICT ("slug") DO NOTHING;`,
    );
  }
  console.log(statements.join('\n--> statement-breakpoint\n'));
  process.exit(0);
}

// 1) Default AI model.
statements.push(
  `INSERT INTO "ai_models" ("id", "name", "openrouter_model_id", "required_plan", "is_active", "context_length", "price_prompt", "price_completion")\n` +
    `VALUES (${q(DEFAULT_MODEL_ID)}, ${q(REFERENCE_MODEL.name)}, ${q(REFERENCE_MODEL.openrouterModelId)}, ${q(REFERENCE_MODEL.requiredPlan)}, true, ${REFERENCE_MODEL.contextLength}, ${q(REFERENCE_MODEL.pricePrompt)}, ${q(REFERENCE_MODEL.priceCompletion)})\n` +
    `ON CONFLICT ("id") DO NOTHING;`,
);

// 2) Interpreters + enrichment.
for (const i of REFERENCE_INTERPRETERS) {
  statements.push(
    `INSERT INTO "interpreters" ("id", "name", "description", "system_prompt", "image_url", "is_premium", "model_id", "is_active", "sort_order", "tag", "accent_color", "rating", "reviews", "styles", "story", "samples")\n` +
      `VALUES (${q(i.id)}, ${q(i.name)}, ${q(i.description)}, ${q(i.systemPrompt)}, ${q(i.imageUrl)}, ${i.isPremium}, ${q(DEFAULT_MODEL_ID)}, true, ${i.sortOrder}, ${q(i.tag)}, ${q(i.accentColor)}, ${q(i.rating)}, ${i.reviews}, ${textArray(i.styles)}, ${q(i.story)}, ${jsonb(i.samples)})\n` +
      `ON CONFLICT ("id") DO NOTHING;`,
  );
}

// 3) Dream dictionary (id defaults; slug is the conflict key).
for (const r of buildDictionaryRows()) {
  statements.push(
    `INSERT INTO "dictionary_entries" ("type", "slug", "icon", "cat", "sort_order", "name_tr", "tagline_tr", "brief_tr", "kw_tr", "spiritual_tr", "psych_tr", "intuitive_tr", "related", "search_tr")\n` +
      `VALUES (${q(r.type)}, ${q(r.slug)}, ${q(r.icon)}, ${q(r.cat)}, ${r.sortOrder}, ${q(r.nameTr)}, ${q(r.taglineTr)}, ${q(r.briefTr)}, ${q(r.kwTr)}, ${q(r.spiritualTr)}, ${q(r.psychTr)}, ${q(r.intuitiveTr)}, ${textArray(r.related)}, ${q(r.searchTr)})\n` +
      `ON CONFLICT ("slug") DO NOTHING;`,
  );
}

console.log(statements.join('\n--> statement-breakpoint\n'));
