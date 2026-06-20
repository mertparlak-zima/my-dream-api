import { describe, expect, it } from 'vitest';
import { appRequest } from './helpers/app';
import { setupDatabaseTestFile } from './helpers/lifecycle';

describe('app smoke', () => {
  setupDatabaseTestFile();

  it('responds to the health endpoint', async () => {
    const response = await appRequest('/health');

    expect(response.status).toBe(200);
    // Redis is unconfigured in the test env → reported as 'disabled'.
    await expect(response.json()).resolves.toEqual({
      success: true,
      status: 'ok',
      redis: 'disabled',
    });
  });
});
