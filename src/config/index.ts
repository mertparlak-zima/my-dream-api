export const RETRY_CONFIG = {
  MAX_COUNT: 3,
  BACKOFF_BASE: 1000,
  STATUS_CODES: [429, 500, 502, 503],
} as const;

export const PORT = Number(process.env.PORT) || 3000;
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const IS_DEV = NODE_ENV === 'development';
