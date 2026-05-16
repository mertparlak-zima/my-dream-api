import type { Context } from 'hono';
import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../src/errors/NotFoundError';
import { errorHandler } from '../../src/middlewares/errorHandler';

function createContext(): Context {
  return {
    json(payload: unknown, status?: number) {
      return new Response(JSON.stringify(payload), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    },
  } as Context;
}

function makeValidationError() {
  return z.object({ rating: z.number().min(1) }).safeParse({ rating: 0 }).error!;
}

async function parseResponse(response: Response) {
  return response.json();
}

async function invokeProductionHandler(error: Error) {
  const previousNodeEnv = process.env.NODE_ENV;

  vi.resetModules();
  process.env.NODE_ENV = 'production';

  const { errorHandler: productionErrorHandler } = await import('../../src/middlewares/errorHandler');
  const response = productionErrorHandler(error, createContext());
  const json = await parseResponse(response);

  process.env.NODE_ENV = previousNodeEnv;

  return { response, json };
}

describe('errorHandler', () => {
  afterEach(() => {
    process.env.NODE_ENV = 'development';
    vi.restoreAllMocks();
  });

  it('returns the AppError envelope', async () => {
    const response = errorHandler(new NotFoundError('missing'), createContext());
    const json = await parseResponse(response);

    expect(response.status).toBe(404);
    expect(json).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'missing',
      },
    });
  });

  it('returns Zod issues in development', async () => {
    const response = errorHandler(makeValidationError(), createContext());
    const json = await parseResponse(response);

    expect(response.status).toBe(400);
    expect(json).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Istek verileri gecersiz.',
        issues: expect.any(Array),
      },
    });
  });

  it('omits Zod issues in production', async () => {
    const { response, json } = await invokeProductionHandler(makeValidationError());

    expect(response.status).toBe(400);
    expect(json).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Istek verileri gecersiz.',
      },
    });
  });

  it('returns the development generic error envelope and logs the error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('kaboom');
    const response = errorHandler(error, createContext());
    const json = await parseResponse(response);

    expect(response.status).toBe(500);
    expect(json).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'kaboom',
      },
    });
    expect(consoleError).toHaveBeenCalledWith('[UNHANDLED_ERROR]', error);
  });

  it('returns the production generic error envelope', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { response, json } = await invokeProductionHandler(new Error('kaboom'));

    expect(response.status).toBe(500);
    expect(json).toEqual({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Beklenmeyen bir hata oluştu.',
      },
    });
  });
});
