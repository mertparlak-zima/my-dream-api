import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../db';
import { NotFoundError } from '../../errors/NotFoundError';
import { interpreters } from './interpreters.schema';

export type InterpreterResponse = {
  id: string;
  name: string;
  description: string;
  image_url: string | null;
  is_premium: boolean;
  sort_order: number;
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
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    image_url: row.imageUrl,
    is_premium: row.isPremium,
    sort_order: row.sortOrder,
  };
}

export const interpretersService = {
  async listActiveInterpreters(): Promise<InterpreterResponse[]> {
    const rows = await db
      .select(interpreterResponseFields)
      .from(interpreters)
      .where(eq(interpreters.isActive, true))
      .orderBy(asc(interpreters.sortOrder), asc(interpreters.name));

    return rows.map(serializeInterpreter);
  },
  async getInterpreterById(id: string): Promise<InterpreterResponse> {
    const [row] = await db
      .select(interpreterResponseFields)
      .from(interpreters)
      .where(and(eq(interpreters.id, id), eq(interpreters.isActive, true)))
      .limit(1);

    if (!row) {
      throw new NotFoundError('Yorumcu bulunamadi.');
    }

    return serializeInterpreter(row);
  },
};
