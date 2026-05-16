import { zValidator as honoZValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import * as z from 'zod';
import { IS_DEV } from '../config';

// The @hono/zod-validator overload preserves c.req.valid(...) types only when
// TypeScript infers this wrapper's return type from the underlying call.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function zValidator<TSchema extends z.ZodSchema, TTarget extends keyof ValidationTargets>(
  target: TTarget,
  schema: TSchema,
) {
  return honoZValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Istek verileri gecersiz.',
            issues: IS_DEV ? result.error.issues : undefined,
          },
        },
        400,
      );
    }

    return undefined;
  });
}
