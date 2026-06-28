import { Hono } from 'hono';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { getAuthUserId } from '../../utils/authContext';
import { zValidator } from '../../utils/zValidator';
import { appleCredentialSchema, bootstrapProfileSchema } from './auth.schemas';
import { authService } from './auth.service';

export const authRoutes = new Hono();

// First-login profile name capture (Apple/Google). Identity + sessions are
// handled by the Better Auth handler mounted at /api/auth/*.
authRoutes.post('/profile/bootstrap', authMiddleware, zValidator('json', bootstrapProfileSchema), async (c) => {
  const user = await authService.bootstrapProfile(getAuthUserId(c), c.req.valid('json'));

  return c.json({ success: true, data: user });
});

// Captures a revocable Apple refresh token from the native authorization code so
// the Apple grant can be revoked at account deletion (App Store 5.1.1(v)).
authRoutes.post('/apple/credential', authMiddleware, zValidator('json', appleCredentialSchema), async (c) => {
  await authService.storeAppleRefreshToken(getAuthUserId(c), c.req.valid('json'));

  return c.json({ success: true });
});
