import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { CORS_CONFIG } from './config';
import { authRoutes } from './features/auth/auth.controller';
import { creditsRoutes } from './features/credits/credits.controller';
import { dreamsRoutes } from './features/dreams/dreams.controller';
import { interpretersRoutes } from './features/interpreters/interpreters.controller';
import { usersRoutes } from './features/users/users.controller';
import { errorHandler } from './middlewares/errorHandler';
import { createRateLimitMiddleware } from './middlewares/rateLimitMiddleware';

const app = new Hono();

app.onError(errorHandler);

app.use(
  '*',
  cors({
    origin: CORS_CONFIG.ALLOWED_ORIGINS.length > 0 ? CORS_CONFIG.ALLOWED_ORIGINS : '*',
  }),
);
app.use('*', createRateLimitMiddleware());

app.get('/', (c) => {
  return c.json({ success: true, message: 'My Dream API v1.0' });
});

app.get('/health', (c) => {
  return c.json({ success: true, status: 'ok' });
});

app.route('/auth', authRoutes);
app.route('/users', usersRoutes);
app.route('/interpreters', interpretersRoutes);
app.route('/dreams', dreamsRoutes);
app.route('/credits', creditsRoutes);

export default app;
