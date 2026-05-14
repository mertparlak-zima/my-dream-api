import { Hono } from 'hono';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { getAuthUserId } from '../../utils/authContext';
import { usersService } from './users.service';

export const usersRoutes = new Hono();

usersRoutes.use('*', authMiddleware);

usersRoutes.get('/me', async (c) => {
  const user = await usersService.getCurrentUser(getAuthUserId(c));

  return c.json({ success: true, data: user });
});
