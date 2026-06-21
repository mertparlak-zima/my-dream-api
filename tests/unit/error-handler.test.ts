import type { Context } from 'hono';
import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '../../src/errors/NotFoundError';
import { errorHandler } from '../../src/middlewares/errorHandler';
import { logger } from '../../src/utils/logger';

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
  const previousEnv = {
    NODE_ENV: process.env.NODE_ENV,
    SUPABASE_URL: process.env.SUPABASE_URL,
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS,
    DEV_AUTH_ENABLED: process.env.DEV_AUTH_ENABLED,
  };

  vi.resetModules();
  process.env.NODE_ENV = 'production';
  process.env.SUPABASE_URL = 'https://project.supabase.co';
  process.env.OPENROUTER_API_KEY = 'openrouter-key';
  process.env.CORS_ALLOWED_ORIGINS = 'https://mydream.app';
  process.env.DEV_AUTH_ENABLED = 'false';
  process.env.BETTER_AUTH_SECRET = 'x'.repeat(32);
  process.env.BETTER_AUTH_URL = 'https://api.example.com';

  try {
    const { errorHandler: productionErrorHandler } = await import('../../src/middlewares/errorHandler');
    const response = productionErrorHandler(error, createContext());
    const json = await parseResponse(response);

    return { response, json };
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
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
    const logError = vi.spyOn(logger, 'error');
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
    expect(logError).toHaveBeenCalledWith('unhandled error', expect.objectContaining({ op: 'http' }));
  });

  it('returns the production generic error envelope', async () => {
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
