import type { Context } from 'hono';
import { AppError } from '../errors/AppError';
import { IS_DEV } from '../config';

export function errorHandler(err: Error, c: Context): Response {
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
