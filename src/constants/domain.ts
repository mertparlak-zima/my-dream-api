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

export const TEXT_SIZES = ['small', 'normal', 'large', 'xlarge'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];
export const DEFAULT_TEXT_SIZE: TextSize = 'normal';

export const LANGUAGES = ['tr', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'tr';

export const CREDIT_TRANSACTION_TYPES = ['USED_WEEKLY', 'USED_EXTRA', 'PURCHASED', 'REFUNDED'] as const;
export type CreditTransactionType = (typeof CREDIT_TRANSACTION_TYPES)[number];
export const CREDIT_TRANSACTION_TYPE = {
  USED_WEEKLY: CREDIT_TRANSACTION_TYPES[0],
  USED_EXTRA: CREDIT_TRANSACTION_TYPES[1],
  PURCHASED: CREDIT_TRANSACTION_TYPES[2],
  REFUNDED: CREDIT_TRANSACTION_TYPES[3],
} as const satisfies Record<CreditTransactionType, CreditTransactionType>;

// --- Better Auth + Postgres migration domain model (Step 7) ---

export const ENTITLEMENT_STATUSES = ['active', 'expired', 'canceled'] as const;
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];
export const ENTITLEMENT_STATUS = {
  active: ENTITLEMENT_STATUSES[0],
  expired: ENTITLEMENT_STATUSES[1],
  canceled: ENTITLEMENT_STATUSES[2],
} as const satisfies Record<EntitlementStatus, EntitlementStatus>;

export const BILLING_PROVIDERS = ['revenuecat', 'admin', 'free'] as const;
export type BillingProvider = (typeof BILLING_PROVIDERS)[number];
export const BILLING_PROVIDER = {
  revenuecat: BILLING_PROVIDERS[0],
  admin: BILLING_PROVIDERS[1],
  free: BILLING_PROVIDERS[2],
} as const satisfies Record<BillingProvider, BillingProvider>;

export const STORES = ['app_store', 'google_play'] as const;
export type Store = (typeof STORES)[number];

export const QUOTA_KEYS = ['weekly_free_dream', 'subscription_daily_dream'] as const;
export type QuotaKey = (typeof QUOTA_KEYS)[number];
export const QUOTA_KEY = {
  weekly_free_dream: QUOTA_KEYS[0],
  subscription_daily_dream: QUOTA_KEYS[1],
} as const satisfies Record<QuotaKey, QuotaKey>;

export const QUOTA_SOURCES = ['weekly_free', 'subscription_daily', 'wallet'] as const;
export type QuotaSource = (typeof QUOTA_SOURCES)[number];
export const QUOTA_SOURCE = {
  weekly_free: QUOTA_SOURCES[0],
  subscription_daily: QUOTA_SOURCES[1],
  wallet: QUOTA_SOURCES[2],
} as const satisfies Record<QuotaSource, QuotaSource>;

export const LEDGER_REASONS = ['purchase', 'admin_adjustment', 'dream_charge', 'dream_processing_refund'] as const;
export type LedgerReason = (typeof LEDGER_REASONS)[number];
export const LEDGER_REASON = {
  purchase: LEDGER_REASONS[0],
  admin_adjustment: LEDGER_REASONS[1],
  dream_charge: LEDGER_REASONS[2],
  dream_processing_refund: LEDGER_REASONS[3],
} as const satisfies Record<LedgerReason, LedgerReason>;

export const AUDIT_EVENTS = [
  'SIGN_IN', 'SIGN_OUT', 'ACCOUNT_LINK', 'SESSION_REVOKE', 'PROFILE_BOOTSTRAP', 'ADMIN_ACTION', 'AUTH_FAILURE',
] as const;
export type AuditEvent = (typeof AUDIT_EVENTS)[number];

export const AUDIT_SOURCES = ['api', 'webhook', 'admin', 'worker'] as const;
export type AuditSource = (typeof AUDIT_SOURCES)[number];
export const AUDIT_SOURCE = {
  api: AUDIT_SOURCES[0],
  webhook: AUDIT_SOURCES[1],
  admin: AUDIT_SOURCES[2],
  worker: AUDIT_SOURCES[3],
} as const satisfies Record<AuditSource, AuditSource>;
