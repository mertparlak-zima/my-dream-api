import { OpenAPIHono } from '@hono/zod-openapi';
import { Scalar } from '@scalar/hono-api-reference';
import { cors } from 'hono/cors';
import { auth } from './auth/auth';
import { CORS_CONFIG } from './config';
import { authRoutes } from './features/auth/auth.controller';
import { creditsRoutes } from './features/credits/credits.controller';
import { dictionaryRoutes } from './features/dictionary/dictionary.controller';
import { dreamsRoutes } from './features/dreams/dreams.controller';
import { updatesRoutes } from './features/updates/updates.controller';
import { interpretersRoutes } from './features/interpreters/interpreters.controller';
import { NotFoundError } from './errors/NotFoundError';
import { usersRoutes } from './features/users/users.controller';
import { errorHandler } from './middlewares/errorHandler';
import { createRateLimitMiddleware } from './middlewares/rateLimitMiddleware';
import { requestLogger } from './middlewares/requestLogger';
import { registerOpenApi } from './openapi/register';
import { redisPing } from './services/redis';
import { captureDebugSentryEvent, initSentry, isSentryEnabled } from './utils/sentry';

await initSentry();

const app = new OpenAPIHono();

app.onError(errorHandler);
app.notFound((c) => errorHandler(new NotFoundError(), c));

app.use('*', requestLogger);
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

// Better Auth owns sign-in/up, session and OAuth callbacks. Mounted after the
// global CORS + rate-limit middleware so /api/auth/* is covered by both.
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

app.route('/auth', authRoutes);
app.route('/users', usersRoutes);
app.route('/interpreters', interpretersRoutes);
app.route('/dictionary', dictionaryRoutes);
app.route('/updates', updatesRoutes);
app.route('/dreams', dreamsRoutes);
app.route('/credits', creditsRoutes);

export default app;
