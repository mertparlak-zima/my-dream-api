import { pgEnum } from 'drizzle-orm/pg-core';
import { AUTH_PROVIDERS, CREDIT_TRANSACTION_TYPES, DREAM_STATUSES, PLANS } from '../constants/domain';

export const authProviderEnum = pgEnum('auth_provider', AUTH_PROVIDERS);
export const planEnum = pgEnum('plan', PLANS);
export const dreamStatusEnum = pgEnum('dream_status', DREAM_STATUSES);
export const creditTransactionTypeEnum = pgEnum('credit_transaction_type', CREDIT_TRANSACTION_TYPES);
