import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { NotFoundError } from '../../errors/NotFoundError';
import { CACHE_KEY, CACHE_TTL, cached } from '../../services/cache';
import {
  type InterpreterSample,
  getInterpreterEnrichment,
} from './interpreters.enrichment';
import { interpreters } from './interpreters.schema';

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
  samples: InterpreterSample[];
};

const interpreterResponseFields = {
  id: interpreters.id,
  name: interpreters.name,
  description: interpreters.description,
  imageUrl: interpreters.imageUrl,
  isPremium: interpreters.isPremium,
  sortOrder: interpreters.sortOrder,
};

function serializeInterpreter(row: {
  id: string;
  name: string;
  description: string;
  imageUrl: string | null;
  isPremium: boolean;
  sortOrder: number;
}): InterpreterResponse {
  const enrichment = getInterpreterEnrichment(row.id);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    image_url: row.imageUrl,
    is_premium: row.isPremium,
    sort_order: row.sortOrder,
    rating: enrichment.rating,
    reviews: enrichment.reviews,
    styles: enrichment.styles,
    story: enrichment.story,
    samples: enrichment.samples,
  };
}

export const interpretersService = {
  async listActiveInterpreters(): Promise<InterpreterResponse[]> {
    // Read-heavy + static dataset → read-through cache (no write endpoints, so
    // TTL is the refresh mechanism; a re-seed shows up within CACHE_TTL).
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
