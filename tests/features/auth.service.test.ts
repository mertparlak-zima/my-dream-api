import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { users } from '../../src/db/schema';
import { authService } from '../../src/features/auth/auth.service';
import { testDb } from '../helpers/db';
import { createDreamFixture, createInterpreterFixture, seedBareUser } from '../helpers/fixtures';
import { setupDatabaseTestFile } from '../helpers/lifecycle';

describe('authService.bootstrapProfile', () => {
  setupDatabaseTestFile();

  it('fills first/last name once and ignores later overwrites', async () => {
    const userId = await seedBareUser();

    await authService.bootstrapProfile(userId, { first_name: 'Ada', last_name: 'Lovelace' });
    // A logged-in user must not be able to keep rewriting their captured name.
    await authService.bootstrapProfile(userId, { first_name: 'Grace', last_name: 'Hopper' });

    const stored = await testDb.query.users.findFirst({ where: eq(users.id, userId) });
    expect(stored).toMatchObject({ firstName: 'Ada', lastName: 'Lovelace' });
  });

  it('returns bookmark_count 0 for a brand-new user', async () => {
    const userId = await seedBareUser();

    const response = await authService.bootstrapProfile(userId, { first_name: 'New', last_name: 'User' });

    expect(response.bookmark_count).toBe(0);
  });

  it('returns the real bookmark_count for a returning user with bookmarks', async () => {
    const userId = await seedBareUser();
    const interpreter = await createInterpreterFixture();

    await createDreamFixture({ userId, interpreterId: interpreter.id, isBookmarked: true });
    await createDreamFixture({ userId, interpreterId: interpreter.id, isBookmarked: false });

    const response = await authService.bootstrapProfile(userId, {});

    expect(response.bookmark_count).toBe(1);
  });
});
