import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { DATABASE_URL } from '../config';
import * as schema from './schema';

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required to initialize the database connection.');
}

export const queryClient = postgres(DATABASE_URL);
export const db = drizzle(queryClient, { schema });
