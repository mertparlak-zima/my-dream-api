import { Hono } from 'hono';
import { auth } from '../../auth/auth';
import { DEV_AUTH_ENABLED } from '../../config';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { getAuthUserId } from '../../utils/authContext';
import { zValidator } from '../../utils/zValidator';
import { deleteCurrentUser } from './deletion.service';
import { updatePreferencesSchema } from './user_preferences.schemas';
import { userPreferencesService } from './user_preferences.service';
import { usersService } from './users.service';

export const usersRoutes = new Hono();

usersRoutes.use('*', authMiddleware);

usersRoutes.get('/me', async (c) => {
  const user = await usersService.getCurrentUser(getAuthUserId(c));

  return c.json({ success: true, data: user });
});

// Account deletion (Apple/Google store requirement). Gated on a fresh session in
// production, so real users re-authenticate before a permanent delete. The
// X-Dev-User-Id dev bypass has no Better Auth session, so it is treated as fresh
// to keep deletion testable locally. DEV_AUTH_ENABLED is always false in prod, so
// the re-auth gate always applies there.
usersRoutes.delete('/me', async (c) => {
  const devAuth = DEV_AUTH_ENABLED && Boolean(c.req.header('X-Dev-User-Id'));
  const session = devAuth ? null : await auth.api.getSession({ headers: c.req.raw.headers });
  const sessionCreatedAt = devAuth ? new Date() : (session?.session.createdAt ?? null);

  await deleteCurrentUser(getAuthUserId(c), sessionCreatedAt);

  return c.json({ success: true });
});

usersRoutes.get('/me/preferences', async (c) => {
  const preferences = await userPreferencesService.getPreferences(getAuthUserId(c));

  return c.json({ success: true, data: preferences });
});

usersRoutes.patch('/me/preferences', zValidator('json', updatePreferencesSchema), async (c) => {
  const preferences = await userPreferencesService.updatePreferences(getAuthUserId(c), c.req.valid('json'));

  return c.json({ success: true, data: preferences });
});
