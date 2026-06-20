import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { requestLogger } from '../../src/middlewares/requestLogger';
import { getLogContext } from '../../src/utils/logger';

describe('requestLogger middleware', () => {
  it('runs the request inside a log context with a generated requestId', async () => {
    const app = new Hono();
    app.use('*', requestLogger);
    app.get('/ctx', (c) => c.json({ requestId: getLogContext()?.requestId ?? null }));

    const response = await app.request('/ctx');
    expect(response.status).toBe(200);

    const body = (await response.json()) as { requestId: string | null };
    expect(body.requestId).toBeTypeOf('string');
    expect(body.requestId).not.toHaveLength(0);
  });

  it('completes normally for non-2xx downstream responses', async () => {
    const app = new Hono();
    app.use('*', requestLogger);
    app.get('/missing', (c) => c.json({ error: true }, 404));

    const response = await app.request('/missing');
    expect(response.status).toBe(404);
  });
});
