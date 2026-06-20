import { PLAN, type Plan } from '../constants/domain';
import { parseRuntimeEnv } from './env';

export { parseRuntimeEnv };

export const runtimeEnv = parseRuntimeEnv();

export const RETRY_CONFIG = {
  MAX_COUNT: 3,
  BACKOFF_BASE: 1000,
  STATUS_CODES: [408, 429, 500, 502, 503],
} as const;

export const PORT = runtimeEnv.PORT;
export const NODE_ENV = runtimeEnv.NODE_ENV;
export const IS_DEV = NODE_ENV === 'development';
export const IS_TEST = NODE_ENV === 'test';
export const IS_PRODUCTION = NODE_ENV === 'production';

export const DATABASE_URL = runtimeEnv.DATABASE_URL;
export const REDIS_URL = runtimeEnv.REDIS_URL;
export const JWT_SECRET = runtimeEnv.JWT_SECRET;
export const OPENROUTER_API_KEY = runtimeEnv.OPENROUTER_API_KEY;
export const SUPABASE_URL = runtimeEnv.SUPABASE_URL;
export const SUPABASE_JWKS_URL = runtimeEnv.SUPABASE_JWKS_URL;
export const SUPABASE_JWT_ISSUER = runtimeEnv.SUPABASE_JWT_ISSUER;
export const DEV_AUTH_ENABLED = runtimeEnv.DEV_AUTH_ENABLED;

export const CORS_CONFIG = {
  ALLOWED_ORIGINS: runtimeEnv.CORS_ALLOWED_ORIGINS,
} as const;

export const RATE_LIMIT_CONFIG = {
  WINDOW_MS: 60_000,
  MAX_REQUESTS: 120,
} as const;

export const SENTRY_CONFIG = {
  DSN: runtimeEnv.SENTRY_DSN,
  ENVIRONMENT: runtimeEnv.SENTRY_ENVIRONMENT,
  RELEASE: runtimeEnv.SENTRY_RELEASE,
  TRACES_SAMPLE_RATE: runtimeEnv.SENTRY_TRACES_SAMPLE_RATE,
} as const;

export const LOG_CONFIG = {
  LEVEL: runtimeEnv.LOG_LEVEL,
  FORMAT: runtimeEnv.LOG_FORMAT,
  ENABLED: runtimeEnv.LOG_ENABLED,
} as const;

export const DREAM_CONFIG = {
  MIN_CONTENT_LENGTH: 10,
  MAX_CONTENT_LENGTH: 6000,
  MAX_FEEDBACK_LENGTH: 1000,
  MIN_RATING: 0,
  MAX_RATING: 10,
} as const;

export const DREAM_PROCESSING_CONFIG = {
  PROCESSING_DELAY_MS: 300,
  COMPLETION_DELAY_MS: 0,
  PROVIDER_TIMEOUT_MS: 30_000,
  MAX_INTERPRETATION_LENGTH: 12_000,
  OPENROUTER_CHAT_COMPLETIONS_URL: 'https://openrouter.ai/api/v1/chat/completions',
  OPENROUTER_TEMPERATURE: 0.7,
  OPENROUTER_MAX_TOKENS: 1_200,
} as const;

export const PLAN_LIMITS: Record<Plan, number> = {
  [PLAN.FREE]: 1,
  [PLAN.PRO]: 7,
  [PLAN.MAX]: 30,
} as const;
