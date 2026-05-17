import { z } from 'zod';

const NODE_ENV_VALUES = ['development', 'test', 'production'] as const;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

const emptyToUndefined = (value: unknown): unknown => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

const optionalUrl = z.preprocess(
  emptyToUndefined,
  z.string().url().optional(),
);

const optionalPositiveInteger = z.preprocess(
  emptyToUndefined,
  z.coerce.number().int().positive().optional(),
);

const csvList = z.preprocess(
  (value) => {
    if (typeof value !== 'string') {
      return [];
    }

    return value.split(',').map((item: string) => item.trim()).filter(Boolean);
  },
  z.array(z.string()),
);

const rawEnvSchema = z.object({
  NODE_ENV: z.enum(NODE_ENV_VALUES).default('development'),
  PORT: optionalPositiveInteger,
  DATABASE_URL: optionalString,
  JWT_SECRET: optionalString,
  OPENROUTER_API_KEY: optionalString,
  SUPABASE_URL: optionalUrl.transform((value) => (value ? trimTrailingSlash(value) : undefined)),
  SUPABASE_JWKS_URL: optionalUrl,
  SUPABASE_JWT_ISSUER: optionalUrl,
  CORS_ALLOWED_ORIGINS: csvList,
  RATE_LIMIT_WINDOW_MS: optionalPositiveInteger,
  RATE_LIMIT_MAX_REQUESTS: optionalPositiveInteger,
  DEV_AUTH_ENABLED: z.preprocess(
    emptyToUndefined,
    z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  ),
});

const productionEnvSchema = rawEnvSchema.superRefine((env, ctx) => {
  const addRequiredIssue = (path: keyof z.infer<typeof rawEnvSchema>, message: string): void => {
    ctx.addIssue({ code: 'custom', path: [path], message });
  };

  if (env.NODE_ENV !== 'production') {
    return;
  }

  if (!env.DATABASE_URL) {
    addRequiredIssue('DATABASE_URL', 'DATABASE_URL is required in production.');
  }

  if (!env.SUPABASE_URL) {
    addRequiredIssue('SUPABASE_URL', 'SUPABASE_URL is required in production.');
  }

  if (!env.OPENROUTER_API_KEY) {
    addRequiredIssue('OPENROUTER_API_KEY', 'OPENROUTER_API_KEY is required in production.');
  }

  if (env.CORS_ALLOWED_ORIGINS.length === 0 || env.CORS_ALLOWED_ORIGINS.includes('*')) {
    addRequiredIssue(
      'CORS_ALLOWED_ORIGINS',
      'CORS_ALLOWED_ORIGINS must list explicit origins in production.',
    );
  }

  if (!env.RATE_LIMIT_WINDOW_MS) {
    addRequiredIssue('RATE_LIMIT_WINDOW_MS', 'RATE_LIMIT_WINDOW_MS must be a positive integer in production.');
  }

  if (!env.RATE_LIMIT_MAX_REQUESTS) {
    addRequiredIssue('RATE_LIMIT_MAX_REQUESTS', 'RATE_LIMIT_MAX_REQUESTS must be a positive integer in production.');
  }

  if (!env.JWT_SECRET && !env.SUPABASE_JWKS_URL && !env.SUPABASE_URL) {
    addRequiredIssue('JWT_SECRET', 'JWT_SECRET or Supabase JWKS config is required in production.');
  }

  if (env.DEV_AUTH_ENABLED) {
    addRequiredIssue('DEV_AUTH_ENABLED', 'DEV_AUTH_ENABLED must not be true in production.');
  }
});

export type RuntimeEnv = z.infer<typeof productionEnvSchema> & {
  PORT: number;
  SUPABASE_JWKS_URL: string | undefined;
  SUPABASE_JWT_ISSUER: string | undefined;
  RATE_LIMIT_WINDOW_MS: number;
  RATE_LIMIT_MAX_REQUESTS: number;
  DEV_AUTH_ENABLED: boolean;
};

function deriveSupabaseAuthEnv(env: z.infer<typeof productionEnvSchema>): RuntimeEnv {
  return {
    ...env,
    PORT: env.PORT ?? 3000,
    SUPABASE_JWKS_URL: env.SUPABASE_JWKS_URL
      ?? (env.SUPABASE_URL ? `${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json` : undefined),
    SUPABASE_JWT_ISSUER: env.SUPABASE_JWT_ISSUER
      ?? (env.SUPABASE_URL ? `${env.SUPABASE_URL}/auth/v1` : undefined),
    RATE_LIMIT_WINDOW_MS: env.RATE_LIMIT_WINDOW_MS ?? 60_000,
    RATE_LIMIT_MAX_REQUESTS: env.RATE_LIMIT_MAX_REQUESTS ?? 120,
    DEV_AUTH_ENABLED: (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') && env.DEV_AUTH_ENABLED,
  };
}

function formatEnvError(error: z.ZodError): Error {
  const messages = error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });

  return new Error(`Invalid runtime config:\n- ${messages.join('\n- ')}`);
}

export function parseRuntimeEnv(source: NodeJS.ProcessEnv = process.env): RuntimeEnv {
  const parsed = productionEnvSchema.safeParse(source);

  if (!parsed.success) {
    throw formatEnvError(parsed.error);
  }

  return deriveSupabaseAuthEnv(parsed.data);
}
