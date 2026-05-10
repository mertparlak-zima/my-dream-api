import { AppError } from './AppError';

export class CreditError extends AppError {
  constructor(message = 'Krediniz yetersiz.') {
    super(402, 'INSUFFICIENT_CREDITS', message);
  }
}
