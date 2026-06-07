import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { NotFoundError } from '../../errors/NotFoundError';
import { CACHE_KEY, CACHE_TTL, cached } from '../../services/cache';
import { interpreters, type InterpreterSampleRow } from './interpreters.schema';

export type InterpreterResponse = {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  is_premium: boolean;
  sort_order: number;
  rating: number | null;
  reviews: number;
  styles: string[];
  story: string | null;
  samples: InterpreterSampleRow[];
};

const interpreterResponseFields = {
  id: interpreters.id,
  name: interpreters.name,
  description: interpreters.description,
  imageUrl: interpreters.imageUrl,
  isPremium: interpreters.isPremium,
  sortOrder: interpreters.sortOrder,
  rating: interpreters.rating,
  reviews: interpreters.reviews,
  styles: interpreters.styles,
  story: interpreters.story,
  samples: interpreters.samples,
};

function serializeInterpreter(row: {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  isPremium: boolean;
  sortOrder: number;
  rating: string | null;
  reviews: number;
  styles: string[] | null;
  story: string | null;
  samples: InterpreterSampleRow[] | null;
}): InterpreterResponse {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    image_url: row.imageUrl,
    is_premium: row.isPremium,
    sort_order: row.sortOrder,
    rating: row.rating !== null ? Number(row.rating) : null,
    reviews: row.reviews,
    styles: row.styles ?? [],
    story: row.story,
    samples: row.samples ?? [],
  };
}

export const interpretersService = {
  async listActiveInterpreters(): Promise<InterpreterResponse[]> {
    // Read-heavy, rarely changes → read-through cache. On enrichment edits,
    // re-seed/invalidate `CACHE_KEY.interpreters`.
    return cached(`${CACHE_KEY.interpreters}:list`, { ttlSeconds: CACHE_TTL.INTERPRETERS }, async () => {
      const rows = await db
        .select(interpreterResponseFields)
        .from(interpreters)
        .where(eq(interpreters.isActive, true))
        .orderBy(asc(interpreters.sortOrder), asc(interpreters.name));

      return rows.map(serializeInterpreter);
    });
  },
  async getInterpreterById(id: string): Promise<InterpreterResponse> {
    return cached(`${CACHE_KEY.interpreters}:byId:${id}`, { ttlSeconds: CACHE_TTL.INTERPRETERS }, async () => {
      const [row] = await db
        .select(interpreterResponseFields)
        .from(interpreters)
        .where(and(eq(interpreters.id, id), eq(interpreters.isActive, true)))
        .limit(1);

      if (!row) {
        throw new NotFoundError('Yorumcu bulunamadi.');
      }

      return serializeInterpreter(row);
    });
  },
};
