export const AUTH_PROVIDERS = ['GOOGLE', 'APPLE'] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export const PLANS = ['FREE', 'PRO', 'MAX'] as const;
export type Plan = (typeof PLANS)[number];

export const DREAM_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;
export type DreamStatus = (typeof DREAM_STATUSES)[number];

export const CREDIT_TRANSACTION_TYPES = ['USED_WEEKLY', 'USED_EXTRA', 'PURCHASED', 'REFUNDED'] as const;
export type CreditTransactionType = (typeof CREDIT_TRANSACTION_TYPES)[number];
