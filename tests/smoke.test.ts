import { describe, expect, it } from 'vitest';
import { appRequest } from './helpers/app';
import { setupDatabaseTestFile } from './helpers/lifecycle';

describe('app smoke', () => {
  setupDatabaseTestFile();

  it('responds to the health endpoint', async () => {
    const response = await appRequest('/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      status: 'ok',
    });
  });
});
