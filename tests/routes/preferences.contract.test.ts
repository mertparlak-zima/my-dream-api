import { describe, expect, it } from 'vitest';
import { appRequest } from '../helpers/app';
import { createAuthedUserFixture } from '../helpers/fixtures';
import { setupDatabaseTestFile } from '../helpers/lifecycle';

async function requestJson(
  path: string,
  init?: { method?: string; headers?: Record<string, string>; body?: unknown },
) {
  const response = await appRequest(path, {
    method: init?.method,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  return { response, json: await response.json() };
}

describe('GET/PATCH /users/me/preferences (contract)', () => {
  setupDatabaseTestFile();

  it('requires authentication', async () => {
    const { response, json } = await requestJson('/users/me/preferences');
    expect(response.status).toBe(401);
    expect(json.error.code).toBe('UNAUTHORIZED');
  });

  it('returns defaults when the user has no preferences row yet', async () => {
    const user = await createAuthedUserFixture();

    const { response, json } = await requestJson('/users/me/preferences', { headers: user.authHeaders });

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, data: { text_size: 'normal', language: 'tr' } });
  });

  it('persists a single field and leaves the other at its default', async () => {
    const user = await createAuthedUserFixture();

    const patched = await requestJson('/users/me/preferences', {
      method: 'PATCH',
      headers: user.authHeaders,
      body: { text_size: 'large' },
    });

    expect(patched.response.status).toBe(200);
    expect(patched.json.data).toEqual({ text_size: 'large', language: 'tr' });

    // Persisted across a fresh GET.
    const fetched = await requestJson('/users/me/preferences', { headers: user.authHeaders });
    expect(fetched.json.data).toEqual({ text_size: 'large', language: 'tr' });
  });

  it('updates language on an existing row without resetting text_size', async () => {
    const user = await createAuthedUserFixture();

    await requestJson('/users/me/preferences', {
      method: 'PATCH',
      headers: user.authHeaders,
      body: { text_size: 'xlarge' },
    });

    const patched = await requestJson('/users/me/preferences', {
      method: 'PATCH',
      headers: user.authHeaders,
      body: { language: 'en' },
    });

    expect(patched.response.status).toBe(200);
    expect(patched.json.data).toEqual({ text_size: 'xlarge', language: 'en' });
  });

  it('accepts both fields at once', async () => {
    const user = await createAuthedUserFixture();

    const patched = await requestJson('/users/me/preferences', {
      method: 'PATCH',
      headers: user.authHeaders,
      body: { text_size: 'small', language: 'en' },
    });

    expect(patched.json.data).toEqual({ text_size: 'small', language: 'en' });
  });

  it('rejects an empty body', async () => {
    const user = await createAuthedUserFixture();

    const { response, json } = await requestJson('/users/me/preferences', {
      method: 'PATCH',
      headers: user.authHeaders,
      body: {},
    });

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an invalid enum value', async () => {
    const user = await createAuthedUserFixture();

    const { response, json } = await requestJson('/users/me/preferences', {
      method: 'PATCH',
      headers: user.authHeaders,
      body: { text_size: 'huge' },
    });

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });
});
