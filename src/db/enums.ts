import { pgEnum } from 'drizzle-orm/pg-core';

export const authProviderEnum = pgEnum('auth_provider', ['GOOGLE', 'APPLE']);
export const planEnum = pgEnum('plan', ['FREE', 'PRO', 'MAX']);
export const dreamStatusEnum = pgEnum('dream_status', ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']);
export const creditTransactionTypeEnum = pgEnum('credit_transaction_type', [
  'USED_WEEKLY',
  'USED_EXTRA',
  'PURCHASED',
  'REFUNDED',
]);
