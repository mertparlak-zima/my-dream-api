import { createMiddleware } from 'hono/factory';
import { jwtVerify } from 'jose';
import { AuthError } from '../errors/AuthError';
import { JWT_SECRET } from '../config';

export const authMiddleware = createMiddleware(async (c, next) => {
  const authorization = c.req.header('Authorization');
  const token = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined;

  if (!token || !JWT_SECRET) {
    throw new AuthError();
  }

  const secret = new TextEncoder().encode(JWT_SECRET);

  try {
    const { payload } = await jwtVerify(token, secret);

    if (!payload.sub) {
      throw new AuthError();
    }

    c.set('userId', payload.sub);
    await next();
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }

    throw new AuthError();
  }
});
