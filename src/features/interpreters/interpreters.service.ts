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

export const interpretersService = {
  async listActiveInterpreters(): Promise<InterpreterResponse[]> {
    const rows = await db
      .select({
        id: interpreters.id,
        name: interpreters.name,
        description: interpreters.description,
        imageUrl: interpreters.imageUrl,
        isPremium: interpreters.isPremium,
        sortOrder: interpreters.sortOrder,
      })
      .from(interpreters)
      .where(eq(interpreters.isActive, true))
      .orderBy(asc(interpreters.sortOrder), asc(interpreters.name));

    return rows.map((interpreter) => ({
      id: interpreter.id,
      name: interpreter.name,
      description: interpreter.description,
      image_url: interpreter.imageUrl,
      is_premium: interpreter.isPremium,
      sort_order: interpreter.sortOrder,
    }));
  },
  async getInterpreterById(id: string): Promise<InterpreterResponse> {
    const row = await db.query.interpreters.findFirst({
      where: and(eq(interpreters.id, id), eq(interpreters.isActive, true)),
    });

    if (!row) {
      throw new NotFoundError('Yorumcu bulunamadi.');
    }

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      image_url: row.imageUrl,
      is_premium: row.isPremium,
      sort_order: row.sortOrder,
    };
  },
};
