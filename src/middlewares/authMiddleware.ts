import { createMiddleware } from 'hono/factory';
import { auth } from '../auth/auth';
import { DEV_AUTH_ENABLED } from '../config';
import { AuthError } from '../errors/AuthError';
import { setLogUser } from '../utils/logger';

/**
 * Resolves the authenticated user from the Better Auth session (cookie/header)
 * via `auth.api.getSession`. In development/test, an explicit `X-Dev-User-Id`
 * header bypasses session verification (the seeded local dev user). Identity is
 * owned entirely by Better Auth — there is no JWT/JWKS verification here.
 */
export const authMiddleware = createMiddleware(async (c, next) => {
  const devUserId = c.req.header('X-Dev-User-Id');

  if (DEV_AUTH_ENABLED && devUserId) {
    c.set('userId', devUserId);
    setLogUser(devUserId);
    await next();
    return;
  }

  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    throw new AuthError();
  }

  c.set('userId', session.user.id);
  setLogUser(session.user.id);
  await next();
});
