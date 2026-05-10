import { AppError } from './AppError';

export class ForbiddenError extends AppError {
  constructor(message = 'Bu işlem için yetkiniz yok.') {
    super(403, 'FORBIDDEN', message);
  }
}
