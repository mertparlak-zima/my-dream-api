import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { getAuthUserId } from '../../utils/authContext';
import { syncUserSchema } from './auth.schemas';
import { authService } from './auth.service';

export const authRoutes = new Hono();

authRoutes.post('/sync', authMiddleware, zValidator('json', syncUserSchema), async (c) => {
  const user = await authService.syncUser(getAuthUserId(c), c.req.valid('json'));

  return c.json({ success: true, data: user });
});
