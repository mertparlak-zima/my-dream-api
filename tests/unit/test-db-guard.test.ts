import { afterEach, describe, expect, it } from 'vitest';
import { assertLocalTestDatabase } from '../helpers/db';

const LOCAL_URL = 'postgres://mydream:mydream@localhost:5433/mydream';
const PROD_URL = 'postgres://postgres:secret@db.abcdefgh.supabase.co:5432/postgres';

describe('assertLocalTestDatabase', () => {
  afterEach(() => {
    delete process.env.ALLOW_NON_LOCAL_TEST_DB;
  });

  it('allows local hosts', () => {
    expect(() => assertLocalTestDatabase(LOCAL_URL)).not.toThrow();
    expect(() => assertLocalTestDatabase('postgres://u:p@127.0.0.1:5432/db')).not.toThrow();
  });

  it('refuses a non-local (prod) host', () => {
    expect(() => assertLocalTestDatabase(PROD_URL)).toThrow(/non-local database host/);
  });

  it('allows a non-local host only with the explicit override', () => {
    process.env.ALLOW_NON_LOCAL_TEST_DB = 'true';
    expect(() => assertLocalTestDatabase(PROD_URL)).not.toThrow();
  });

  it('throws on an unparseable url', () => {
    expect(() => assertLocalTestDatabase('not-a-url')).toThrow(/Invalid test database url/);
  });
});
