import { describe, expect, it } from 'vitest';

import { AUTH_PROVIDER } from '../../src/constants/domain';
import { resolveStoredAppleEmail } from '../../src/auth/apple-email';
import { createUserFixture } from '../helpers/fixtures';
import { setupDatabaseTestFile } from '../helpers/lifecycle';

describe('resolveStoredAppleEmail', () => {
  setupDatabaseTestFile();

  it('returns the stored email for the linked Apple account matched by sub', async () => {
    const sub = `001999.${crypto.randomUUID()}.0001`;
    const email = `apple-return-${crypto.randomUUID()}@mydream.local`;
    await createUserFixture({ authProvider: AUTH_PROVIDER.APPLE, providerId: sub, email });

    await expect(resolveStoredAppleEmail(sub)).resolves.toBe(email);
  });

  it('returns null when no Apple account exists for the sub (fail-loud upstream)', async () => {
    await expect(resolveStoredAppleEmail(`unlinked.${crypto.randomUUID()}`)).resolves.toBeNull();
  });

  it('does not match a different provider sharing the same accountId', async () => {
    // A Google account whose accountId collides with the queried value must not
    // leak its email through the Apple lookup — the providerId filter guards it.
    const sub = `shared.${crypto.randomUUID()}`;
    await createUserFixture({ authProvider: AUTH_PROVIDER.GOOGLE, providerId: sub });

    await expect(resolveStoredAppleEmail(sub)).resolves.toBeNull();
  });
});
