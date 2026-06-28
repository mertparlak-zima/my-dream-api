import { AppError } from './AppError';

/**
 * Raised when an Apple token-endpoint call (authorization-code exchange or token
 * revocation) fails. Modelled as a 502 because the failure is upstream (Apple),
 * not the client's request — this keeps account deletion fail-loud rather than
 * silently degrading when Apple's `/auth/revoke` is unavailable.
 */
export class AppleTokenError extends AppError {
  constructor(message = 'Apple ile iletişim kurulamadı, lütfen tekrar deneyin.') {
    super(502, 'APPLE_TOKEN_ERROR', message);
  }
}
