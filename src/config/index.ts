import { PLAN, type Plan } from '../constants/domain';
import { parseRuntimeEnv } from './env';

export { parseRuntimeEnv };

export const runtimeEnv = parseRuntimeEnv();

export const RETRY_CONFIG = {
  MAX_COUNT: 3,
  BACKOFF_BASE: 1000,
  STATUS_CODES: [429, 500, 502, 503],
} as const;

export const PORT = runtimeEnv.PORT;
export const NODE_ENV = runtimeEnv.NODE_ENV;
export const IS_DEV = NODE_ENV === 'development';
export const IS_TEST = NODE_ENV === 'test';
export const IS_PRODUCTION = NODE_ENV === 'production';

export const DATABASE_URL = runtimeEnv.DATABASE_URL;
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
  WINDOW_MS: runtimeEnv.RATE_LIMIT_WINDOW_MS,
  MAX_REQUESTS: runtimeEnv.RATE_LIMIT_MAX_REQUESTS,
} as const;

export const DREAM_CONFIG = {
  MIN_CONTENT_LENGTH: 10,
  MAX_CONTENT_LENGTH: 6000,
  MAX_FEEDBACK_LENGTH: 1000,
  MIN_RATING: 0,
  MAX_RATING: 10,
} as const;

export const PLAN_LIMITS: Record<Plan, number> = {
  [PLAN.FREE]: 1,
  [PLAN.PRO]: 7,
  [PLAN.MAX]: 30,
} as const;
