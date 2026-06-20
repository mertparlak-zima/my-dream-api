import { Hono } from 'hono';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { getAuthUserId } from '../../utils/authContext';
import { zValidator } from '../../utils/zValidator';
import { updatePreferencesSchema } from './user_preferences.schemas';
import { userPreferencesService } from './user_preferences.service';
import { usersService } from './users.service';

export const usersRoutes = new Hono();

usersRoutes.use('*', authMiddleware);

usersRoutes.get('/me', async (c) => {
  const user = await usersService.getCurrentUser(getAuthUserId(c));

  return c.json({ success: true, data: user });
});

usersRoutes.get('/me/preferences', async (c) => {
  const preferences = await userPreferencesService.getPreferences(getAuthUserId(c));

  return c.json({ success: true, data: preferences });
});

usersRoutes.patch('/me/preferences', zValidator('json', updatePreferencesSchema), async (c) => {
  const preferences = await userPreferencesService.updatePreferences(getAuthUserId(c), c.req.valid('json'));

  return c.json({ success: true, data: preferences });
});
