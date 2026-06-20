import { createMiddleware } from 'hono/factory';
import { logger, runWithLogContext } from '../utils/logger';

/**
 * Per-request correlation + access logging (#61). Generates a `requestId`,
 * exposes it on the Hono context, and runs the rest of the pipeline inside an
 * AsyncLocalStorage context so every downstream log line shares that id (and
 * the `userId` once authMiddleware resolves it). Emits an `http` line on
 * receipt and on completion with method/path/status/durationMs.
 */
export const requestLogger = createMiddleware(async (c, next) => {
  const requestId = crypto.randomUUID();
  c.set('requestId', requestId);

  const method = c.req.method;
  const path = new URL(c.req.url).pathname;
  const start = Date.now();

  await runWithLogContext({ requestId }, async () => {
    logger.http('request received', { op: 'http', method, path });
    await next();
    logger.http('request completed', {
      op: 'http',
      method,
      path,
      status: c.res.status,
      durationMs: Date.now() - start,
    });
  });
});
