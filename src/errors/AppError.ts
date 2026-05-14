import type { ContentfulStatusCode } from 'hono/utils/http-status';

export class AppError extends Error {
  constructor(
    public statusCode: ContentfulStatusCode,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
