import { Hono } from 'hono';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { usersService } from './users.service';

export const usersRoutes = new Hono();

usersRoutes.use('*', authMiddleware);

usersRoutes.get('/me', (c) => {
  usersService.getCurrentUser();
  return c.json({ success: true });
});
