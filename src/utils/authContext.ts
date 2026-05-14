import type { Context } from 'hono';
import { AuthError } from '../errors/AuthError';

export function getAuthUserId(c: Context): string {
  const userId = c.get('userId');

  if (typeof userId !== 'string' || userId.length === 0) {
    throw new AuthError();
  }

  return userId;
}
