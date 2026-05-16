import type { HonoRequest } from 'hono';

let appPromise: Promise<{ request: HonoRequest['request'] }> | undefined;

async function loadApp(): Promise<{ request: HonoRequest['request'] }> {
  const module = await import('../../src/index');
  return module.default;
}

export async function getApp(): Promise<{ request: HonoRequest['request'] }> {
  appPromise ??= loadApp();
  return appPromise;
}

export async function appRequest(
  input: string | Request,
  init?: RequestInit,
): Promise<Response> {
  const app = await getApp();
  return app.request(input, init);
}
