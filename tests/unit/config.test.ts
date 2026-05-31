import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

type EnvOverride = Record<string, string | undefined>;

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }

  Object.assign(process.env, originalEnv);
}

function setEnv(overrides: EnvOverride): void {
  restoreEnv();

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function loadEnvParser() {
  vi.resetModules();
  return import('../../src/config/env');
}

async function parseEnv(overrides: EnvOverride = {}) {
  setEnv(overrides);
  const { parseRuntimeEnv } = await loadEnvParser();
  return parseRuntimeEnv(process.env);
}

describe('runtime config', () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
  });

  it('applies development defaults without requiring production-only env values', async () => {
    const env = await parseEnv({
      NODE_ENV: 'development',
      DATABASE_URL: undefined,
      SUPABASE_URL: undefined,
      OPENROUTER_API_KEY: undefined,
      CORS_ALLOWED_ORIGINS: undefined,
    });

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.SENTRY_DSN).toBeUndefined();
    expect(env.SENTRY_ENVIRONMENT).toBe('development');
    expect(env.SENTRY_TRACES_SAMPLE_RATE).toBe(1);
  });

  it('rejects missing production env values', async () => {
    const { parseRuntimeEnv } = await loadEnvParser();

    setEnv({
      NODE_ENV: 'production',
      DATABASE_URL: undefined,
      SUPABASE_URL: undefined,
      OPENROUTER_API_KEY: undefined,
      CORS_ALLOWED_ORIGINS: undefined,
      JWT_SECRET: undefined,
      DEV_AUTH_ENABLED: undefined,
    });

    expect(() => parseRuntimeEnv(process.env)).toThrow(/DATABASE_URL is required in production/);
    expect(() => parseRuntimeEnv(process.env)).toThrow(/SUPABASE_URL is required in production/);
    expect(() => parseRuntimeEnv(process.env)).toThrow(/OPENROUTER_API_KEY is required in production/);
  });

  it('rejects production dev auth and wildcard CORS', async () => {
    const { parseRuntimeEnv } = await loadEnvParser();

    setEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://mydream:mydream@localhost:5433/mydream',
      SUPABASE_URL: 'https://project.supabase.co',
      OPENROUTER_API_KEY: 'openrouter-key',
      CORS_ALLOWED_ORIGINS: '*',
      JWT_SECRET: 'jwt-secret',
      DEV_AUTH_ENABLED: 'true',
    });

    expect(() => parseRuntimeEnv(process.env)).toThrow(/DEV_AUTH_ENABLED must not be true in production/);
    expect(() => parseRuntimeEnv(process.env)).toThrow(/CORS_ALLOWED_ORIGINS must list explicit origins/);
  });

  it('accepts explicit production env values and derives Supabase JWKS config', async () => {
    const env = await parseEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://mydream:mydream@localhost:5433/mydream',
      SUPABASE_URL: 'https://project.supabase.co/',
      OPENROUTER_API_KEY: 'openrouter-key',
      CORS_ALLOWED_ORIGINS: 'https://app.mydream.local,https://admin.mydream.local',
      JWT_SECRET: undefined,
      DEV_AUTH_ENABLED: 'false',
    });

    expect(env.SUPABASE_URL).toBe('https://project.supabase.co');
    expect(env.SUPABASE_JWKS_URL).toBe('https://project.supabase.co/auth/v1/.well-known/jwks.json');
    expect(env.DEV_AUTH_ENABLED).toBe(false);
    expect(env.SENTRY_ENVIRONMENT).toBe('production');
    expect(env.SENTRY_TRACES_SAMPLE_RATE).toBe(0.1);
    expect(env.CORS_ALLOWED_ORIGINS).toEqual([
      'https://app.mydream.local',
      'https://admin.mydream.local',
    ]);
  });

  it('accepts optional Sentry env values without making DSN required', async () => {
    const env = await parseEnv({
      NODE_ENV: 'development',
      SENTRY_DSN: 'https://examplePublicKey@o0.ingest.sentry.io/0',
      SENTRY_ENVIRONMENT: 'local',
      SENTRY_RELEASE: 'my-dream-api@1.0.0',
      SENTRY_TRACES_SAMPLE_RATE: '0.25',
    });

    expect(env.SENTRY_DSN).toBe('https://examplePublicKey@o0.ingest.sentry.io/0');
    expect(env.SENTRY_ENVIRONMENT).toBe('local');
    expect(env.SENTRY_RELEASE).toBe('my-dream-api@1.0.0');
    expect(env.SENTRY_TRACES_SAMPLE_RATE).toBe(0.25);
  });

  it('rejects invalid Sentry sample rates', async () => {
    const { parseRuntimeEnv } = await loadEnvParser();

    setEnv({
      NODE_ENV: 'development',
      SENTRY_TRACES_SAMPLE_RATE: '2',
    });

    expect(() => parseRuntimeEnv(process.env)).toThrow(/SENTRY_TRACES_SAMPLE_RATE/);
  });

  it('throws during config module import when runtime env is invalid', async () => {
    setEnv({
      NODE_ENV: 'production',
      DATABASE_URL: undefined,
      SUPABASE_URL: undefined,
      OPENROUTER_API_KEY: undefined,
      CORS_ALLOWED_ORIGINS: undefined,
    });
    vi.resetModules();

    await expect(import('../../src/config/index')).rejects.toThrow(/Invalid runtime config/);
  });
});
