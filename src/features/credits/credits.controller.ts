import { Hono } from 'hono';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { getAuthUserId } from '../../utils/authContext';
import { creditsService } from './credits.service';

export const creditsRoutes = new Hono();

creditsRoutes.use('*', authMiddleware);

creditsRoutes.get('/me', async (c) => {
  const credits = await creditsService.getCurrentCredits(getAuthUserId(c));

  return c.json({ success: true, data: credits });
});
