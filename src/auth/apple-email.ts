import { and, eq } from 'drizzle-orm';

import { db } from '../db';
import { accounts, users } from '../db/schema';

/**
 * Apple includes the `email` claim in the id token only on the user's very first
 * authorization; every returning native sign-in omits it, and Apple exposes no
 * user-info endpoint to fetch it later. Better Auth's id-token sign-in path
 * (`POST /api/auth/sign-in/social`) requires an email *before* it resolves the
 * account by the stable Apple subject, so a returning user would otherwise be
 * rejected with `USER_EMAIL_NOT_FOUND`.
 *
 * We backfill the real address already persisted for the linked Apple account
 * (matched by `accountId` = the Apple `sub`). No synthetic/placeholder email is
 * ever produced: when no linked account is found we return `null` and let Better
 * Auth fail loud, per the no-silent-fallback policy.
 *
 * @param sub The Apple subject claim (`sub`) — stable per Apple ID + app team.
 * @returns The stored email for the linked Apple account, or `null` if none.
 */
export async function resolveStoredAppleEmail(sub: string): Promise<string | null> {
  const [row] = await db
    .select({ email: users.email })
    .from(accounts)
    .innerJoin(users, eq(users.id, accounts.userId))
    .where(and(eq(accounts.providerId, 'apple'), eq(accounts.accountId, sub)))
    .limit(1);

  return row?.email ?? null;
}
