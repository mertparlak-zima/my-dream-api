import { Hono } from 'hono';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { creditsService } from './credits.service';

export const creditsRoutes = new Hono();

creditsRoutes.use('*', authMiddleware);

creditsRoutes.get('/me', (c) => {
  creditsService.getCurrentCredits();
  return c.json({ success: true });
});
