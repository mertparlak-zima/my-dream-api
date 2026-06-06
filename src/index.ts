import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { cors } from 'hono/cors';
import { CORS_CONFIG } from './config';
import { authRoutes } from './features/auth/auth.controller';
import { creditsRoutes } from './features/credits/credits.controller';
import { dreamsRoutes } from './features/dreams/dreams.controller';
import { interpretersRoutes } from './features/interpreters/interpreters.controller';
import { NotFoundError } from './errors/NotFoundError';
import { usersRoutes } from './features/users/users.controller';
import { errorHandler } from './middlewares/errorHandler';
import { createRateLimitMiddleware } from './middlewares/rateLimitMiddleware';
import { registerOpenApi } from './openapi/register';
import { redisPing } from './services/redis';
import { captureDebugSentryEvent, initSentry, isSentryEnabled } from './utils/sentry';

await initSentry();

const app = new OpenAPIHono();

app.onError(errorHandler);
app.notFound((c) => errorHandler(new NotFoundError(), c));

app.use(
  '*',
  cors({
    origin: CORS_CONFIG.ALLOWED_ORIGINS,
  }),
);
app.use('*', createRateLimitMiddleware());

app.get('/', (c) => {
  return c.json({ success: true, message: 'My Dream API v1.0' });
});

app.get('/health', async (c) => {
  const redis = await redisPing();
  return c.json({ success: true, status: 'ok', redis });
});

if (process.env.NODE_ENV !== 'production') {
  app.get('/debug-sentry', async (c) => {
    const { eventId, flushed } = await captureDebugSentryEvent(c);

    return c.json({
      success: true,
      sentryEnabled: isSentryEnabled(),
      eventId,
      flushed,
    });
  });
}

registerOpenApi(app);

app.doc('/openapi.json', (c) => ({
  openapi: '3.0.0',
  info: {
    title: 'My Dream API',
    version: '1.0.0',
    description: 'Dream interpretation API for My Dream mobile app.',
  },
  servers: [
    {
      url: new URL(c.req.url).origin,
      description: 'Current environment',
    },
  ],
}));

app.get('/docs', Scalar((c) => ({
  pageTitle: 'My Dream API Reference',
  url: new URL('/openapi.json', c.req.url).toString(),
})));

app.route('/auth', authRoutes);
app.route('/users', usersRoutes);
app.route('/interpreters', interpretersRoutes);
app.route('/dreams', dreamsRoutes);
app.route('/credits', creditsRoutes);

export default app;
