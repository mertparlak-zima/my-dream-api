import { AppError } from './AppError';

export class ConflictError extends AppError {
  constructor(message = 'İstek çakışması.', code = 'CONFLICT') {
    super(409, code, message);
  }
}
