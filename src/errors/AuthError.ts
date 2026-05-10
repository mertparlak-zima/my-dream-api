import { AppError } from './AppError';

export class AuthError extends AppError {
  constructor(message = 'Geçersiz veya süresi dolmuş token.') {
    super(401, 'UNAUTHORIZED', message);
  }
}
