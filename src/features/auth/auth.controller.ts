import { Hono } from 'hono';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { getAuthUserId } from '../../utils/authContext';
import { zValidator } from '../../utils/zValidator';
import { bootstrapProfileSchema } from './auth.schemas';
import { authService } from './auth.service';

export const authRoutes = new Hono();

// First-login profile name capture (Apple/Google). Identity + sessions are
// handled by the Better Auth handler mounted at /api/auth/*.
authRoutes.post('/profile/bootstrap', authMiddleware, zValidator('json', bootstrapProfileSchema), async (c) => {
  const user = await authService.bootstrapProfile(getAuthUserId(c), c.req.valid('json'));

  return c.json({ success: true, data: user });
});
