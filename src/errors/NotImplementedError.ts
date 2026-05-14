import { AppError } from './AppError';

export class NotImplementedError extends AppError {
  constructor(message = 'Bu endpoint henuz uygulanmadi.') {
    super(501, 'NOT_IMPLEMENTED', message);
  }
}
