export const AUTH_PROVIDERS = ['GOOGLE', 'APPLE'] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];
export const AUTH_PROVIDER = {
  GOOGLE: AUTH_PROVIDERS[0],
  APPLE: AUTH_PROVIDERS[1],
} as const satisfies Record<AuthProvider, AuthProvider>;

export const PLANS = ['FREE', 'PRO', 'MAX'] as const;
export type Plan = (typeof PLANS)[number];
export const PLAN = {
  FREE: PLANS[0],
  PRO: PLANS[1],
  MAX: PLANS[2],
} as const satisfies Record<Plan, Plan>;

export const DREAM_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;
export type DreamStatus = (typeof DREAM_STATUSES)[number];
export const DREAM_STATUS = {
  PENDING: DREAM_STATUSES[0],
  PROCESSING: DREAM_STATUSES[1],
  COMPLETED: DREAM_STATUSES[2],
  FAILED: DREAM_STATUSES[3],
} as const satisfies Record<DreamStatus, DreamStatus>;

export const CREDIT_TRANSACTION_TYPES = ['USED_WEEKLY', 'USED_EXTRA', 'PURCHASED', 'REFUNDED'] as const;
export type CreditTransactionType = (typeof CREDIT_TRANSACTION_TYPES)[number];
export const CREDIT_TRANSACTION_TYPE = {
  USED_WEEKLY: CREDIT_TRANSACTION_TYPES[0],
  USED_EXTRA: CREDIT_TRANSACTION_TYPES[1],
  PURCHASED: CREDIT_TRANSACTION_TYPES[2],
  REFUNDED: CREDIT_TRANSACTION_TYPES[3],
} as const satisfies Record<CreditTransactionType, CreditTransactionType>;
