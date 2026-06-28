import { symmetricDecrypt } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BETTER_AUTH_SECRET } from '../../src/config';
import { AUTH_PROVIDER } from '../../src/constants/domain';
import { accounts } from '../../src/db/schema';
import { authService } from '../../src/features/auth/auth.service';
import { testDb } from '../helpers/db';
import { createUserFixture, resetFixtures } from '../helpers/fixtures';
import { setupDatabaseTestFile } from '../helpers/lifecycle';

vi.mock('../../src/auth/apple-token', () => ({
  exchangeAppleAuthorizationCode: vi.fn(),
  revokeAppleToken: vi.fn(),
}));

import { exchangeAppleAuthorizationCode } from '../../src/auth/apple-token';

const exchangeMock = vi.mocked(exchangeAppleAuthorizationCode);

async function readAppleRefreshToken(userId: string): Promise<string | null> {
  const [row] = await testDb
    .select({ refreshToken: accounts.refreshToken })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.providerId, 'apple')))
    .limit(1);

  return row?.refreshToken ?? null;
}

describe('authService.storeAppleRefreshToken', () => {
  setupDatabaseTestFile();

  beforeEach(() => {
    exchangeMock.mockReset();
  });

  afterEach(async () => {
    await resetFixtures();
  });

  it('exchanges the code and stores the Apple refresh token encrypted at rest', async () => {
    const user = await createUserFixture({ authProvider: AUTH_PROVIDER.APPLE });
    exchangeMock.mockResolvedValue({ refreshToken: 'apple-refresh-token', accessToken: null });

    await authService.storeAppleRefreshToken(user.id, { authorization_code: 'apple-auth-code' });

    expect(exchangeMock).toHaveBeenCalledWith('apple-auth-code');

    const stored = await readAppleRefreshToken(user.id);
    expect(stored).toBeTruthy();
    // Persisted ciphertext, never the raw token.
    expect(stored).not.toBe('apple-refresh-token');
    await expect(
      symmetricDecrypt({ key: BETTER_AUTH_SECRET!, data: stored! }),
    ).resolves.toBe('apple-refresh-token');
  });

  it('leaves the account untouched when Apple returns no refresh token', async () => {
    const user = await createUserFixture({ authProvider: AUTH_PROVIDER.APPLE });
    exchangeMock.mockResolvedValue({ refreshToken: null, accessToken: 'apple-at' });

    await authService.storeAppleRefreshToken(user.id, { authorization_code: 'apple-auth-code' });

    await expect(readAppleRefreshToken(user.id)).resolves.toBeNull();
  });
});
