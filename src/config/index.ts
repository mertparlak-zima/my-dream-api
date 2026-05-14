import type { Plan } from '../constants/domain';

export const RETRY_CONFIG = {
  MAX_COUNT: 3,
  BACKOFF_BASE: 1000,
  STATUS_CODES: [429, 500, 502, 503],
} as const;

export const PORT = Number(process.env.PORT) || 3000;
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_DEV = NODE_ENV === 'development';

export const DATABASE_URL = process.env.DATABASE_URL;
export const JWT_SECRET = process.env.JWT_SECRET;
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
export const SUPABASE_URL = process.env.SUPABASE_URL;
export const DEV_AUTH_ENABLED = IS_DEV && process.env.DEV_AUTH_ENABLED === 'true';

export const CORS_CONFIG = {
  ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS?.split(',').map((origin: string) => origin.trim()).filter(Boolean) ?? [],
} as const;

export const RATE_LIMIT_CONFIG = {
  WINDOW_MS: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
  MAX_REQUESTS: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 120,
} as const;

export const DREAM_CONFIG = {
  MIN_CONTENT_LENGTH: 10,
  MAX_CONTENT_LENGTH: 6000,
  MAX_FEEDBACK_LENGTH: 1000,
  MIN_RATING: 0,
  MAX_RATING: 10,
} as const;

export const PLAN_LIMITS: Record<Plan, number> = {
  FREE: 1,
  PRO: 7,
  MAX: 30,
} as const;
