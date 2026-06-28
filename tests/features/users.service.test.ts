import { describe, expect, it } from 'vitest';
import { NotFoundError } from '../../src/errors/NotFoundError';
import { countUserBookmarks, usersService } from '../../src/features/users/users.service';
import {
  createDreamFixture,
  createInterpreterFixture,
  createUserFixture,
} from '../helpers/fixtures';
import { setupDatabaseTestFile } from '../helpers/lifecycle';

describe('countUserBookmarks', () => {
  setupDatabaseTestFile();

  it('returns 0 when the user has no dreams', async () => {
    const user = await createUserFixture();
    expect(await countUserBookmarks(user.id)).toBe(0);
  });

  it('counts only bookmarked dreams and ignores unbookmarked ones', async () => {
    const user = await createUserFixture();
    const otherUser = await createUserFixture();
    const interpreter = await createInterpreterFixture();

    await createDreamFixture({ userId: user.id, interpreterId: interpreter.id, isBookmarked: true });
    await createDreamFixture({ userId: user.id, interpreterId: interpreter.id, isBookmarked: true });
    await createDreamFixture({ userId: user.id, interpreterId: interpreter.id, isBookmarked: false });
    // Bookmarks owned by another user must not leak into this user's count.
    await createDreamFixture({ userId: otherUser.id, interpreterId: interpreter.id, isBookmarked: true });

    expect(await countUserBookmarks(user.id)).toBe(2);
  });
});

describe('usersService.getCurrentUser', () => {
  setupDatabaseTestFile();

  it('returns bookmark_count 0 when the user has no bookmarked dreams', async () => {
    const user = await createUserFixture();

    const response = await usersService.getCurrentUser(user.id);

    expect(response.id).toBe(user.id);
    expect(response.bookmark_count).toBe(0);
  });

  it('returns the real bookmark_count reflecting bookmarked dreams', async () => {
    const user = await createUserFixture();
    const interpreter = await createInterpreterFixture();

    await createDreamFixture({ userId: user.id, interpreterId: interpreter.id, isBookmarked: true });
    await createDreamFixture({ userId: user.id, interpreterId: interpreter.id, isBookmarked: false });

    const response = await usersService.getCurrentUser(user.id);

    expect(response.bookmark_count).toBe(1);
  });

  it('throws NotFoundError when the user does not exist', async () => {
    await expect(usersService.getCurrentUser(crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });

  it('maps the linked social account to the auth provider', async () => {
    const user = await createUserFixture({ authProvider: 'APPLE' });

    const response = await usersService.getCurrentUser(user.id);

    expect(response.auth_provider).toBe('APPLE');
  });
});
