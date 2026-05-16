import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/errors/AppError';
import { AuthError } from '../../src/errors/AuthError';
import { CreditError } from '../../src/errors/CreditError';
import { ExternalServiceError } from '../../src/errors/ExternalServiceError';
import { ForbiddenError } from '../../src/errors/ForbiddenError';
import { NotFoundError } from '../../src/errors/NotFoundError';
import { NotImplementedError } from '../../src/errors/NotImplementedError';
import { RateLimitError } from '../../src/errors/RateLimitError';
import { ValidationError } from '../../src/errors/ValidationError';

describe('error contracts', () => {
  it('preserves base AppError fields', () => {
    const error = new AppError(418, 'TEAPOT', 'short and stout');

    expect(error).toBeInstanceOf(Error);
    expect(error.statusCode).toBe(418);
    expect(error.code).toBe('TEAPOT');
    expect(error.message).toBe('short and stout');
    expect(error.name).toBe('AppError');
  });

  it.each([
    [AuthError, 401, 'UNAUTHORIZED', 'Geçersiz veya süresi dolmuş token.'],
    [CreditError, 402, 'INSUFFICIENT_CREDITS', 'Krediniz yetersiz.'],
    [ForbiddenError, 403, 'FORBIDDEN', 'Bu işlem için yetkiniz yok.'],
    [NotFoundError, 404, 'NOT_FOUND', 'Kaynak bulunamadı.'],
    [ValidationError, 400, 'VALIDATION_ERROR', 'İstek verileri geçersiz.'],
    [RateLimitError, 429, 'RATE_LIMITED', 'Çok fazla istek gönderildi.'],
    [NotImplementedError, 501, 'NOT_IMPLEMENTED', 'Bu endpoint henuz uygulanmadi.'],
    [ExternalServiceError, 502, 'AI_SERVICE_ERROR', 'AI servisi şu anda kullanılamıyor.'],
  ])(
    '%s exposes status code, code, and default message',
    (ErrorClass, statusCode, code, message) => {
      const error = new ErrorClass();

      expect(error).toBeInstanceOf(AppError);
      expect(error.statusCode).toBe(statusCode);
      expect(error.code).toBe(code);
      expect(error.message).toBe(message);
    },
  );
});
