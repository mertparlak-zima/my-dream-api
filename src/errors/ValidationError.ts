import { AppError } from './AppError';

export class ValidationError extends AppError {
  constructor(message = 'İstek verileri geçersiz.') {
    super(400, 'VALIDATION_ERROR', message);
  }
}
