import { createMiddleware } from 'hono/factory';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { AuthError } from '../errors/AuthError';
import {
  DEV_AUTH_ENABLED,
  JWT_SECRET,
  SUPABASE_JWKS_URL,
  SUPABASE_JWT_ISSUER,
} from '../config';

let remoteJwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function getRemoteJwks(): ReturnType<typeof createRemoteJWKSet> | undefined {
  if (!SUPABASE_JWKS_URL) {
    return undefined;
  }

  remoteJwks ??= createRemoteJWKSet(new URL(SUPABASE_JWKS_URL));
  return remoteJwks;
}

function getSubject(payload: JWTPayload): string {
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new AuthError();
  }

  return payload.sub;
}

async function verifyAuthToken(token: string): Promise<string> {
  const verifyOptions = SUPABASE_JWT_ISSUER ? { issuer: SUPABASE_JWT_ISSUER } : undefined;

  if (JWT_SECRET) {
    const secret = new TextEncoder().encode(JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    return getSubject(payload);
  }

  const jwks = getRemoteJwks();

  if (!jwks) {
    throw new AuthError();
  }

  const { payload } = await jwtVerify(token, jwks, verifyOptions);
  return getSubject(payload);
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const devUserId = c.req.header('X-Dev-User-Id');

  if (DEV_AUTH_ENABLED && devUserId) {
    c.set('userId', devUserId);
    await next();
    return;
  }

  const authorization = c.req.header('Authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined;

  if (!token) {
    throw new AuthError();
  }

  try {
    c.set('userId', await verifyAuthToken(token));
    await next();
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }

    throw new AuthError();
  }
});
