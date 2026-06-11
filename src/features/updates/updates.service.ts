import { and, desc, eq, lt, or, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { db } from '../../db';
import { ValidationError } from '../../errors/ValidationError';
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

export type UpdatesPage = {
  items: AppUpdateResponse[];
  nextCursor: string | null;
};

export type ListUpdatesOptions = {
  limit: number;
  cursor?: string;
};

type UpdatesCursor = { publishedAt: Date; slug: string };

function encodeUpdatesCursor(cursor: UpdatesCursor): string {
  return Buffer.from(
    JSON.stringify({ publishedAt: cursor.publishedAt.toISOString(), slug: cursor.slug }),
  ).toString('base64url');
}

function decodeUpdatesCursor(cursor: string): UpdatesCursor {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
      publishedAt?: unknown;
      slug?: unknown;
    };
    if (typeof parsed.publishedAt !== 'string' || typeof parsed.slug !== 'string') {
      throw new Error('Missing cursor fields.');
    }
    const publishedAt = new Date(parsed.publishedAt);
    if (Number.isNaN(publishedAt.getTime())) {
      throw new Error('Invalid cursor date.');
    }
    return { publishedAt, slug: parsed.slug };
  } catch {
    throw new ValidationError('Gecersiz cursor.');
  }
}

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
  /**
   * Active updates, newest first, cursor-paginated (keyset on publishedAt+slug).
   * Cached per language + page (changes occasionally).
   */
  async listUpdates(lang: UpdatesLang, options: ListUpdatesOptions): Promise<UpdatesPage> {
    const { limit, cursor } = options;
    const cacheKey = `${CACHE_KEY.updates}:list:${lang}:${cursor ?? 'first'}:${limit}`;

    return cached(cacheKey, { ttlSeconds: CACHE_TTL.UPDATES }, async () => {
      const decoded = cursor ? decodeUpdatesCursor(cursor) : null;
      const whereConditions: SQL[] = [eq(appUpdates.isActive, true)];

      if (decoded) {
        const cursorCondition = or(
          lt(appUpdates.publishedAt, decoded.publishedAt),
          and(eq(appUpdates.publishedAt, decoded.publishedAt), lt(appUpdates.slug, decoded.slug)),
        );
        if (cursorCondition) {
          whereConditions.push(cursorCondition);
        }
      }

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
        .where(and(...whereConditions))
        .orderBy(desc(appUpdates.publishedAt), desc(appUpdates.slug))
        .limit(limit + 1)) as UpdateRow[];

      const pageRows = rows.slice(0, limit);
      const hasMore = rows.length > limit;
      const last = pageRows[pageRows.length - 1];

      return {
        items: pageRows.map(serialize),
        nextCursor: hasMore && last ? encodeUpdatesCursor({ publishedAt: last.publishedAt, slug: last.slug }) : null,
      };
    });
  },
};
