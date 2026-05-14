import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { syncUserSchema } from './auth.schemas';
import { authService } from './auth.service';

export const authRoutes = new Hono();

authRoutes.post('/sync', authMiddleware, zValidator('json', syncUserSchema), (c) => {
  authService.syncUser();
  return c.json({ success: true });
});
