import type { Context } from 'hono';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';
import { IS_DEV } from '../config';
import { logger, serializeError } from '../utils/logger';
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

  // requestId/userId are attached via the request-scoped log context (#61).
  logger.error('unhandled error', { op: 'http', err: serializeError(err) });
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
