import { AppError } from './AppError';

export class ExternalServiceError extends AppError {
  constructor(message = 'AI servisi şu anda kullanılamıyor.') {
    super(502, 'AI_SERVICE_ERROR', message);
  }
}
