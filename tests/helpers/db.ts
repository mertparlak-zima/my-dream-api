import type { SQL } from 'drizzle-orm';
import { eq, inArray, like, or } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../src/db/schema';

const TEST_EMAIL_PREFIX = 'vitest+';
const TEST_TEXT_PREFIX = 'vitest:';
const TEST_MODEL_PREFIX = 'vitest/';

type CreatedRowKind = 'dream' | 'credit' | 'user' | 'model' | 'interpreter';

const createdIds: Record<CreatedRowKind, Set<string>> = {
  dream: new Set<string>(),
  credit: new Set<string>(),
  user: new Set<string>(),
  model: new Set<string>(),
  interpreter: new Set<string>(),
};

function isAllowedFallbackEnv(env: string | undefined): boolean {
  return env === 'development' || env === 'test';
}

/** Hosts the test suite is allowed to wipe rows from without an explicit override. */
const LOCAL_DB_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

/**
 * Refuse to point the test suite at a non-local database. `cleanupTestData()`
 * issues DELETEs, so a stray prod `TEST_DATABASE_URL`/`DATABASE_URL` (e.g. the
 * Supabase url in `.env`) must fail loud rather than silently delete prod rows.
 * Set `ALLOW_NON_LOCAL_TEST_DB=true` to override intentionally (e.g. a remote
 * throwaway test DB).
 */
export function assertLocalTestDatabase(url: string): void {
  if (process.env.ALLOW_NON_LOCAL_TEST_DB === 'true') {
    return;
  }

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error(`Invalid test database url: "${url}".`);
  }

  // Local = loopback set, a bare service name (Docker Compose `db`/`postgres`,
  // no dot), an empty host (Unix domain socket), or an mDNS/local TLD. Real
  // databases (Supabase, RDS, …) are dotted FQDNs and stay blocked.
  const isLocal =
    !host ||
    !host.includes('.') ||
    host.endsWith('.local') ||
    host.endsWith('.localhost') ||
    LOCAL_DB_HOSTS.has(host);

  if (!isLocal) {
    throw new Error(
      `Refusing to run tests against non-local database host "${host}". ` +
        'cleanupTestData() deletes rows — point TEST_DATABASE_URL at a local Postgres, ' +
        'or set ALLOW_NON_LOCAL_TEST_DB=true to override intentionally.',
    );
  }
}

export function resolveTestDatabaseUrl(): string {
  const url = (() => {
    if (process.env.TEST_DATABASE_URL) {
      return process.env.TEST_DATABASE_URL;
    }

    if (isAllowedFallbackEnv(process.env.NODE_ENV) && process.env.DATABASE_URL) {
      return process.env.DATABASE_URL;
    }

    throw new Error(
      'TEST_DATABASE_URL is required for tests. DATABASE_URL fallback is only allowed in development/test.',
    );
  })();

  assertLocalTestDatabase(url);

  return url;
}

export const testQueryClient = postgres(resolveTestDatabaseUrl(), { prepare: false });
export const testDb = drizzle(testQueryClient, { schema });

export function markCreated(kind: CreatedRowKind, id: string): string {
  createdIds[kind].add(id);
  return id;
}

function mergeIds(...groups: Array<Iterable<string>>): string[] {
  return [...new Set(groups.flatMap((group) => [...group]))];
}

async function findTestUserIds(): Promise<string[]> {
  const rows = await testDb
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(like(schema.users.email, `${TEST_EMAIL_PREFIX}%`));

  return mergeIds(createdIds.user, rows.map((row) => row.id));
}

async function findTestModelIds(): Promise<string[]> {
  const rows = await testDb
    .select({ id: schema.aiModels.id })
    .from(schema.aiModels)
    .where(
      or(
        like(schema.aiModels.name, `${TEST_TEXT_PREFIX}%`),
        like(schema.aiModels.openrouterModelId, `${TEST_MODEL_PREFIX}%`),
      ),
    );

  return mergeIds(createdIds.model, rows.map((row) => row.id));
}

async function findTestInterpreterIds(modelIds: string[]): Promise<string[]> {
  const conditions: SQL<unknown>[] = [
    like(schema.interpreters.name, `${TEST_TEXT_PREFIX}%`),
    like(schema.interpreters.description, `${TEST_TEXT_PREFIX}%`),
  ];

  if (modelIds.length > 0) {
    conditions.push(inArray(schema.interpreters.modelId, modelIds));
  }

  const rows = await testDb
    .select({ id: schema.interpreters.id })
    .from(schema.interpreters)
    .where(or(...conditions));

  return mergeIds(createdIds.interpreter, rows.map((row) => row.id));
}

async function findTestDreamIds(userIds: string[], interpreterIds: string[]): Promise<string[]> {
  const conditions: SQL<unknown>[] = [];

  if (userIds.length > 0) {
    conditions.push(inArray(schema.dreams.userId, userIds));
  }

  if (interpreterIds.length > 0) {
    conditions.push(inArray(schema.dreams.interpreterId, interpreterIds));
  }

  if (conditions.length === 0) {
    return [...createdIds.dream];
  }

  const rows = await testDb
    .select({ id: schema.dreams.id })
    .from(schema.dreams)
    .where(or(...conditions));

  return mergeIds(createdIds.dream, rows.map((row) => row.id));
}

export async function cleanupTestData(): Promise<void> {
  const userIds = await findTestUserIds();
  const modelIds = await findTestModelIds();
  const interpreterIds = await findTestInterpreterIds(modelIds);
  const dreamIds = await findTestDreamIds(userIds, interpreterIds);

  // Dreams must go first: dreams.charged_transaction_id / refund_transaction_id
  // reference credit_transactions with ON DELETE RESTRICT, so the ledger rows
  // cannot be deleted while a referencing dream still exists.
  if (dreamIds.length > 0) {
    await testDb.delete(schema.dreams).where(inArray(schema.dreams.id, dreamIds));
  }

  const creditDeleteConditions: SQL<unknown>[] = [];

  if (userIds.length > 0) {
    creditDeleteConditions.push(inArray(schema.creditTransactions.userId, userIds));
  }

  if (dreamIds.length > 0) {
    creditDeleteConditions.push(inArray(schema.creditTransactions.relatedDreamId, dreamIds));
  }

  if (creditDeleteConditions.length > 0) {
    await testDb
      .delete(schema.creditTransactions)
      .where(or(...creditDeleteConditions));
  }

  if (interpreterIds.length > 0) {
    await testDb.delete(schema.interpreters).where(inArray(schema.interpreters.id, interpreterIds));
  }

  if (modelIds.length > 0) {
    await testDb.delete(schema.aiModels).where(inArray(schema.aiModels.id, modelIds));
  }

  if (userIds.length > 0) {
    await testDb.delete(schema.users).where(inArray(schema.users.id, userIds));
  }

  for (const ids of Object.values(createdIds)) {
    ids.clear();
  }
}

export async function ensureUserExists(userId: string): Promise<boolean> {
  const user = await testDb.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { id: true },
  });

  return Boolean(user);
}
