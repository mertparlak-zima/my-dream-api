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

const optionalSampleRate = z.preprocess(
  emptyToUndefined,
  z.coerce.number().min(0).max(1).optional(),
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
  REDIS_URL: optionalString,
  JWT_SECRET: optionalString,
  OPENROUTER_API_KEY: optionalString,
  SUPABASE_URL: optionalUrl.transform((value) => (value ? trimTrailingSlash(value) : undefined)),
  SUPABASE_JWKS_URL: optionalUrl,
  SUPABASE_JWT_ISSUER: optionalUrl,
  CORS_ALLOWED_ORIGINS: csvList,
  SENTRY_DSN: optionalUrl,
  SENTRY_ENVIRONMENT: optionalString,
  SENTRY_RELEASE: optionalString,
  SENTRY_TRACES_SAMPLE_RATE: optionalSampleRate,
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
  SENTRY_ENVIRONMENT: string;
  SENTRY_TRACES_SAMPLE_RATE: number;
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
    SENTRY_ENVIRONMENT: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    SENTRY_TRACES_SAMPLE_RATE: env.SENTRY_TRACES_SAMPLE_RATE ?? (env.NODE_ENV === 'production' ? 0.1 : 1),
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
