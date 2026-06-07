import { desc, eq, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { db } from '../../db';
import { CACHE_KEY, CACHE_TTL, cached } from '../../services/cache';
import { appUpdates } from './updates.schema';

export type UpdatesLang = 'tr' | 'en';

export type AppUpdateResponse = {
  id: string;
  tag: string;
  is_new: boolean;
  published_at: string;
  title: string;
  blurb: string;
  media: string;
  body: string[];
};

/** Resolve a localized text column: `en` falls back to `tr`, both to '' (non-null). */
function loc(lang: UpdatesLang, tr: AnyPgColumn, en: AnyPgColumn): SQL<string> {
  return lang === 'en' ? sql<string>`coalesce(${en}, ${tr}, '')` : sql<string>`coalesce(${tr}, '')`;
}

/** Resolve a localized text[] column with the same fallback. */
function locArray(lang: UpdatesLang, tr: AnyPgColumn, en: AnyPgColumn): SQL<string[]> {
  return lang === 'en'
    ? sql<string[]>`coalesce(${en}, ${tr}, '{}'::text[])`
    : sql<string[]>`coalesce(${tr}, '{}'::text[])`;
}

type UpdateRow = {
  slug: string;
  tag: string;
  isNew: boolean;
  publishedAt: Date;
  title: string;
  blurb: string;
  media: string;
  body: string[];
};

function serialize(row: UpdateRow): AppUpdateResponse {
  return {
    id: row.slug,
    tag: row.tag,
    is_new: row.isNew,
    published_at: row.publishedAt.toISOString(),
    title: row.title,
    blurb: row.blurb,
    media: row.media,
    body: row.body,
  };
}

export const updatesService = {
  /** Active updates, newest first, for a language. Cached (changes occasionally). */
  async listUpdates(lang: UpdatesLang): Promise<AppUpdateResponse[]> {
    return cached(`${CACHE_KEY.updates}:list:${lang}`, { ttlSeconds: CACHE_TTL.UPDATES }, async () => {
      const rows = (await db
        .select({
          slug: appUpdates.slug,
          tag: appUpdates.tag,
          isNew: appUpdates.isNew,
          publishedAt: appUpdates.publishedAt,
          title: loc(lang, appUpdates.titleTr, appUpdates.titleEn),
          blurb: loc(lang, appUpdates.blurbTr, appUpdates.blurbEn),
          media: loc(lang, appUpdates.mediaTr, appUpdates.mediaEn),
          body: locArray(lang, appUpdates.bodyTr, appUpdates.bodyEn),
        })
        .from(appUpdates)
        .where(eq(appUpdates.isActive, true))
        .orderBy(desc(appUpdates.publishedAt))) as UpdateRow[];

      return rows.map(serialize);
    });
  },
};
