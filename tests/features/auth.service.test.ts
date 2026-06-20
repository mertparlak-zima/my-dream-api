import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { AUTH_PROVIDER } from '../../src/constants/domain';
import { users } from '../../src/db/schema';
import { authService } from '../../src/features/auth/auth.service';
import { createDreamFixture, createInterpreterFixture } from '../helpers/fixtures';
import { testDb } from '../helpers/db';
import { setupDatabaseTestFile } from '../helpers/lifecycle';

describe('authService.syncUser', () => {
  setupDatabaseTestFile();

  it('preserves Apple first-login names when later syncs omit them', async () => {
    const userId = crypto.randomUUID();

    await authService.syncUser(userId, {
      email: `vitest+apple-${userId}@mydream.local`,
      auth_provider: AUTH_PROVIDER.APPLE,
      provider_id: `vitest:apple:${userId}`,
      first_name: 'Ada',
      last_name: 'Lovelace',
    });

    await authService.syncUser(userId, {
      email: `vitest+apple-${userId}@mydream.local`,
      auth_provider: AUTH_PROVIDER.APPLE,
      provider_id: `vitest:apple:${userId}`,
    });

    const syncedUser = await testDb.query.users.findFirst({
      where: eq(users.id, userId),
    });

    expect(syncedUser).toMatchObject({
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
  });

  it('returns bookmark_count 0 for a brand-new user', async () => {
    const userId = crypto.randomUUID();

    const response = await authService.syncUser(userId, {
      email: `vitest+new-${userId}@mydream.local`,
      auth_provider: AUTH_PROVIDER.GOOGLE,
      provider_id: `vitest:google:${userId}`,
    });

    expect(response.bookmark_count).toBe(0);
  });

  it('returns the real bookmark_count for a returning user with bookmarks', async () => {
    const userId = crypto.randomUUID();
    const interpreter = await createInterpreterFixture();

    await authService.syncUser(userId, {
      email: `vitest+returning-${userId}@mydream.local`,
      auth_provider: AUTH_PROVIDER.GOOGLE,
      provider_id: `vitest:google:${userId}`,
    });

    await createDreamFixture({ userId, interpreterId: interpreter.id, isBookmarked: true });
    await createDreamFixture({ userId, interpreterId: interpreter.id, isBookmarked: false });

    const response = await authService.syncUser(userId, {
      email: `vitest+returning-${userId}@mydream.local`,
      auth_provider: AUTH_PROVIDER.GOOGLE,
      provider_id: `vitest:google:${userId}`,
    });

    expect(response.bookmark_count).toBe(1);
  });
});
