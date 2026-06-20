import { pgEnum } from 'drizzle-orm/pg-core';
import {
  AUTH_PROVIDERS,
  CREDIT_TRANSACTION_TYPES,
  DREAM_STATUSES,
  LANGUAGES,
  PLANS,
  TEXT_SIZES,
} from '../constants/domain';

export const authProviderEnum = pgEnum('auth_provider', AUTH_PROVIDERS);
export const planEnum = pgEnum('plan', PLANS);
export const dreamStatusEnum = pgEnum('dream_status', DREAM_STATUSES);
export const creditTransactionTypeEnum = pgEnum('credit_transaction_type', CREDIT_TRANSACTION_TYPES);
export const textSizeEnum = pgEnum('text_size', TEXT_SIZES);
export const languageEnum = pgEnum('language', LANGUAGES);
