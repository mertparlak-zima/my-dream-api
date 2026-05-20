import type { Context } from 'hono';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';
import { IS_DEV } from '../config';
import { captureUnexpectedError } from '../utils/sentry';

export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof ZodError) {
    return c.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Istek verileri gecersiz.',
          issues: IS_DEV ? err.issues : undefined,
        },
      },
      400,
    );
  }

  if (err instanceof AppError) {
    return c.json(
      {
        success: false,
        error: {
          code: err.code,
          message: err.message,
        },
      },
      err.statusCode,
    );
  }

  console.error('[UNHANDLED_ERROR]', err);
  captureUnexpectedError(err, c);

  return c.json(
    {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: IS_DEV ? err.message : 'Beklenmeyen bir hata oluştu.',
      },
    },
    500,
  );
}
