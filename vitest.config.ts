import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    fileParallelism: false,
    setupFiles: ['./tests/helpers/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Foundation-step coverage is intentionally scoped to modules with stable
      // domain and error contracts plus the small service slices exercised by
      // contract tests. Broader app wiring and schema modules need dedicated
      // integration coverage before they can reasonably live under a 100% gate.
      include: [
        'src/constants/domain.ts',
        'src/errors/*.ts',
        'src/utils/date.ts',
        'src/middlewares/errorHandler.ts',
        'src/features/dreams/dreams.service.ts',
        'src/features/dreams/dreams.processor.ts',
        'src/features/credits/credits.service.ts',
        'src/features/interpreters/interpreters.service.ts',
        'src/services/cache.ts',
        'src/services/counter.ts',
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
