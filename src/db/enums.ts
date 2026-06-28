import { pgEnum } from 'drizzle-orm/pg-core';
import {
  AUDIT_EVENTS,
  AUDIT_SOURCES,
  BILLING_PROVIDERS,
  DREAM_STATUSES,
  ENTITLEMENT_STATUSES,
  LANGUAGES,
  LEDGER_REASONS,
  PLANS,
  QUOTA_KEYS,
  QUOTA_SOURCES,
  STORES,
  TEXT_SIZES,
} from '../constants/domain';

export const planEnum = pgEnum('plan', PLANS);
export const dreamStatusEnum = pgEnum('dream_status', DREAM_STATUSES);
export const textSizeEnum = pgEnum('text_size', TEXT_SIZES);
export const languageEnum = pgEnum('language', LANGUAGES);

// --- Better Auth + Postgres migration domain enums (Step 7) ---
export const entitlementStatusEnum = pgEnum('entitlement_status', ENTITLEMENT_STATUSES);
export const billingProviderEnum = pgEnum('billing_provider', BILLING_PROVIDERS);
export const storeEnum = pgEnum('store', STORES);
export const quotaKeyEnum = pgEnum('quota_key', QUOTA_KEYS);
export const quotaSourceEnum = pgEnum('quota_source', QUOTA_SOURCES);
export const ledgerReasonEnum = pgEnum('ledger_reason', LEDGER_REASONS);
export const auditEventEnum = pgEnum('audit_event', AUDIT_EVENTS);
export const auditSourceEnum = pgEnum('audit_source', AUDIT_SOURCES);
