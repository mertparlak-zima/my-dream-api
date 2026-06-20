import { describe, expect, it } from 'vitest';
import { appRequest } from '../helpers/app';
import { createAuthedUserFixture, createDreamFixture, createInterpreterFixture } from '../helpers/fixtures';
import { setupDatabaseTestFile } from '../helpers/lifecycle';

async function requestJson(
  path: string,
  init?: { headers?: Record<string, string> },
) {
  const response = await appRequest(path, {
    method: 'GET',
    headers: init?.headers,
  });

  return { response, json: await response.json() };
}

describe('GET /users/me (contract)', () => {
  setupDatabaseTestFile();

  it('requires authentication', async () => {
    const { response, json } = await requestJson('/users/me');

    expect(response.status).toBe(401);
    expect(json.error.code).toBe('UNAUTHORIZED');
  });

  it('returns bookmark_count 0 when the user has no bookmarked dreams', async () => {
    const user = await createAuthedUserFixture();

    const { response, json } = await requestJson('/users/me', { headers: user.authHeaders });

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({
      id: user.id,
      bookmark_count: 0,
    });
  });

  it('returns the real bookmark_count reflecting bookmarked dreams', async () => {
    const user = await createAuthedUserFixture();
    const interpreter = await createInterpreterFixture();

    await createDreamFixture({ userId: user.id, interpreterId: interpreter.id, isBookmarked: true });
    await createDreamFixture({ userId: user.id, interpreterId: interpreter.id, isBookmarked: true });
    await createDreamFixture({ userId: user.id, interpreterId: interpreter.id, isBookmarked: false });

    const { response, json } = await requestJson('/users/me', { headers: user.authHeaders });

    expect(response.status).toBe(200);
    expect(json.data.id).toBe(user.id);
    expect(json.data.bookmark_count).toBe(2);
  });
});
