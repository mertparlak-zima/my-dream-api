import { AppError } from './AppError';

export class NotFoundError extends AppError {
  constructor(message = 'Kaynak bulunamadı.') {
    super(404, 'NOT_FOUND', message);
  }
}
