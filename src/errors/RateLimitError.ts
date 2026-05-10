import { AppError } from './AppError';

export class RateLimitError extends AppError {
  constructor(message = 'Çok fazla istek gönderildi.') {
    super(429, 'RATE_LIMITED', message);
  }
}
