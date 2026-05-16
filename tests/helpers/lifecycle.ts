import { afterAll, afterEach, beforeEach } from 'vitest';
import { cleanupTestData } from './db';

export function setupDatabaseTestFile(): void {
  beforeEach(async () => {
    await cleanupTestData();
  });

  afterEach(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });
}
