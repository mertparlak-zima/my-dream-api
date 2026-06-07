import { and, asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { db } from '../../db';
import { CACHE_KEY, CACHE_TTL, cached } from '../../services/cache';
import { searchTerms } from '../../utils/turkishSearch';
import { dictionaryEntries } from './dictionary.schema';

export type DictionaryLang = 'tr' | 'en';

export type DictCategory = { id: string; label: string; icon: string };
export type DreamSymbol = {
  name: string;
  icon: string;
  cat: string | null;
  kw: string;
  brief: string;
  spiritual: string;
  psych: string;
  intuitive: string;
  related: string[];
};
export type DreamTheme = {
  name: string;
  icon: string;
  tagline: string;
  brief: string;
  spiritual: string;
  psych: string;
  intuitive: string;
  related: string[];
};

export type DictionaryResponse = {
  categories: DictCategory[];
  symbols: DreamSymbol[];
  themes: DreamTheme[];
};

export type DictionarySearchResult = {
  symbols: DreamSymbol[];
  themes: DreamTheme[];
  empty: boolean;
};

/** Resolve a localized column: `en` falls back to `tr`, both to '' (non-null). */
function loc(lang: DictionaryLang, tr: AnyPgColumn, en: AnyPgColumn): SQL<string> {
  return lang === 'en'
    ? sql<string>`coalesce(${en}, ${tr}, '')`
    : sql<string>`coalesce(${tr}, '')`;
}

// Returns a Drizzle select shape (inferred); an explicit type would fight the
// query-builder inference.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function entrySelection(lang: DictionaryLang) {
  return {
    type: dictionaryEntries.type,
    slug: dictionaryEntries.slug,
    icon: dictionaryEntries.icon,
    cat: dictionaryEntries.cat,
    related: sql<string[]>`coalesce(${dictionaryEntries.related}, '{}'::text[])`,
    name: loc(lang, dictionaryEntries.nameTr, dictionaryEntries.nameEn),
    tagline: loc(lang, dictionaryEntries.taglineTr, dictionaryEntries.taglineEn),
    brief: loc(lang, dictionaryEntries.briefTr, dictionaryEntries.briefEn),
    kw: loc(lang, dictionaryEntries.kwTr, dictionaryEntries.kwEn),
    spiritual: loc(lang, dictionaryEntries.spiritualTr, dictionaryEntries.spiritualEn),
    psych: loc(lang, dictionaryEntries.psychTr, dictionaryEntries.psychEn),
    intuitive: loc(lang, dictionaryEntries.intuitiveTr, dictionaryEntries.intuitiveEn),
  };
}

type EntryRow = {
  type: 'category' | 'symbol' | 'theme';
  slug: string;
  icon: string;
  cat: string | null;
  related: string[];
  name: string;
  tagline: string;
  brief: string;
  kw: string;
  spiritual: string;
  psych: string;
  intuitive: string;
};

function toCategory(row: EntryRow): DictCategory {
  return { id: row.slug, label: row.name, icon: row.icon };
}

function toSymbol(row: EntryRow): DreamSymbol {
  return {
    name: row.name,
    icon: row.icon,
    cat: row.cat,
    kw: row.kw,
    brief: row.brief,
    spiritual: row.spiritual,
    psych: row.psych,
    intuitive: row.intuitive,
    related: row.related,
  };
}

function toTheme(row: EntryRow): DreamTheme {
  return {
    name: row.name,
    icon: row.icon,
    tagline: row.tagline,
    brief: row.brief,
    spiritual: row.spiritual,
    psych: row.psych,
    intuitive: row.intuitive,
    related: row.related,
  };
}

function splitEntries(rows: EntryRow[]): { symbols: DreamSymbol[]; themes: DreamTheme[] } {
  const symbols = rows.filter((r) => r.type === 'symbol').map(toSymbol);
  const themes = rows.filter((r) => r.type === 'theme').map(toTheme);
  return { symbols, themes };
}

export const dictionaryService = {
  /** Full dictionary for a language (categories + symbols + themes). Cached. */
  async getDictionary(lang: DictionaryLang): Promise<DictionaryResponse> {
    return cached(`${CACHE_KEY.dictionary}:all:${lang}`, { ttlSeconds: CACHE_TTL.DICTIONARY }, async () => {
      const rows = (await db
        .select(entrySelection(lang))
        .from(dictionaryEntries)
        .where(eq(dictionaryEntries.isActive, true))
        .orderBy(asc(dictionaryEntries.type), asc(dictionaryEntries.sortOrder))) as EntryRow[];

      const { symbols, themes } = splitEntries(rows);
      return { categories: rows.filter((r) => r.type === 'category').map(toCategory), symbols, themes };
    });
  },

  /** Turkish-folded DB search over symbols + themes (only matching rows). */
  async search(query: string, lang: DictionaryLang): Promise<DictionarySearchResult> {
    const terms = searchTerms(query);
    if (terms.length === 0) {
      const all = await this.getDictionary(lang);
      return { symbols: all.symbols, themes: all.themes, empty: false };
    }

    const searchCol = lang === 'en'
      ? sql`coalesce(${dictionaryEntries.searchEn}, ${dictionaryEntries.searchTr})`
      : sql`${dictionaryEntries.searchTr}`;
    const termConditions = terms.map((term) => sql`${searchCol} like ${`%${term}%`}`);

    const rows = (await db
      .select(entrySelection(lang))
      .from(dictionaryEntries)
      .where(
        and(
          eq(dictionaryEntries.isActive, true),
          inArray(dictionaryEntries.type, ['symbol', 'theme']),
          ...termConditions,
        ),
      )
      .orderBy(asc(dictionaryEntries.type), asc(dictionaryEntries.sortOrder))) as EntryRow[];

    const { symbols, themes } = splitEntries(rows);
    return { symbols, themes, empty: symbols.length === 0 && themes.length === 0 };
  },
};
