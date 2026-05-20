import { existsSync } from 'node:fs';

if (existsSync('.env.test')) {
  process.loadEnvFile?.('.env.test');
}

if (existsSync('.env')) {
  process.loadEnvFile?.('.env');
}

const fallbackDatabaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

if (!fallbackDatabaseUrl) {
  throw new Error(
    'Set TEST_DATABASE_URL for API tests. In local development, DATABASE_URL may be used as a fallback.',
  );
}

process.env.NODE_ENV = 'development';
process.env.DEV_AUTH_ENABLED = process.env.DEV_AUTH_ENABLED ?? 'true';
process.env.TEST_DATABASE_URL = fallbackDatabaseUrl;
process.env.DATABASE_URL = fallbackDatabaseUrl;
delete process.env.SENTRY_DSN;
delete process.env.SENTRY_ENVIRONMENT;
delete process.env.SENTRY_RELEASE;
delete process.env.SENTRY_TRACES_SAMPLE_RATE;

const { configureDreamProcessingProvider } = await import('../../src/features/dreams/dreams.processor');

configureDreamProcessingProvider({
  async interpret(request) {
    return { interpretation: `vitest: scheduled interpretation for ${request.dreamId}` };
  },
});
