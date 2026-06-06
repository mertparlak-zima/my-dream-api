import { existsSync } from 'node:fs';

if (existsSync('.env.test')) {
  process.loadEnvFile?.('.env.test');
}

if (existsSync('.env')) {
  process.loadEnvFile?.('.env');
}

const fallbackDatabaseUrl =
  process.env.TEST_DATABASE_URL?.trim() || 'postgres://mydream:mydream@localhost:5433/mydream';

process.env.NODE_ENV = 'development';
process.env.DEV_AUTH_ENABLED = process.env.DEV_AUTH_ENABLED ?? 'true';
process.env.TEST_DATABASE_URL = fallbackDatabaseUrl;
process.env.DATABASE_URL = fallbackDatabaseUrl;
delete process.env.SENTRY_DSN;
delete process.env.SENTRY_ENVIRONMENT;
delete process.env.SENTRY_RELEASE;
delete process.env.SENTRY_TRACES_SAMPLE_RATE;
// Unit/contract tests run with Redis disabled (degraded mode); the live Redis
// path is exercised by the local Docker smoke (#54).
delete process.env.REDIS_URL;

const { configureDreamProcessingProvider } = await import('../../src/features/dreams/dreams.processor');

configureDreamProcessingProvider({
  async interpret(request) {
    return { interpretation: `vitest: scheduled interpretation for ${request.dreamId}` };
  },
});
