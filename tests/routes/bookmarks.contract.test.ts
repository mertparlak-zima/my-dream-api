import { describe, expect, it } from 'vitest';
import { DREAM_STATUS } from '../../src/constants/domain';
import { appRequest } from '../helpers/app';
import { createAuthedUserFixture, createDreamFixture, createInterpreterFixture } from '../helpers/fixtures';
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

describe('PATCH /dreams/:id/bookmark + bookmark filter (contract)', () => {
  setupDatabaseTestFile();

  it('sets and clears the bookmark flag for the owner', async () => {
    const user = await createAuthedUserFixture();
    const interpreter = await createInterpreterFixture();
    const dream = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: 'vitest:bookmark-dream',
      status: DREAM_STATUS.COMPLETED,
      interpretation: 'vitest:bookmark-interpretation',
    });

    const setOn = await requestJson(`/dreams/${dream.id}/bookmark`, {
      method: 'PATCH',
      headers: user.authHeaders,
      body: { bookmarked: true },
    });

    expect(setOn.response.status).toBe(200);
    expect(setOn.json.success).toBe(true);
    expect(setOn.json.data.id).toBe(dream.id);
    expect(setOn.json.data.isBookmarked).toBe(true);

    const setOff = await requestJson(`/dreams/${dream.id}/bookmark`, {
      method: 'PATCH',
      headers: user.authHeaders,
      body: { bookmarked: false },
    });

    expect(setOff.response.status).toBe(200);
    expect(setOff.json.data.isBookmarked).toBe(false);
  });

  it('returns NOT_FOUND when bookmarking a dream owned by another user', async () => {
    const owner = await createAuthedUserFixture();
    const other = await createAuthedUserFixture();
    const interpreter = await createInterpreterFixture();
    const dream = await createDreamFixture({
      userId: owner.id,
      interpreterId: interpreter.id,
      content: 'vitest:bookmark-foreign-dream',
    });

    const { response, json } = await requestJson(`/dreams/${dream.id}/bookmark`, {
      method: 'PATCH',
      headers: other.authHeaders,
      body: { bookmarked: true },
    });

    expect(response.status).toBe(404);
    expect(json).toEqual({
      success: false,
      error: { code: 'NOT_FOUND', message: expect.any(String) },
    });
  });

  it('returns a validation envelope for a non-boolean bookmarked value', async () => {
    const user = await createAuthedUserFixture();
    const interpreter = await createInterpreterFixture();
    const dream = await createDreamFixture({ userId: user.id, interpreterId: interpreter.id });

    const { response, json } = await requestJson(`/dreams/${dream.id}/bookmark`, {
      method: 'PATCH',
      headers: user.authHeaders,
      body: { bookmarked: 'yes' },
    });

    expect(response.status).toBe(400);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('filters the journal list by bookmark state', async () => {
    const user = await createAuthedUserFixture();
    const interpreter = await createInterpreterFixture();
    const bookmarked = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: 'vitest:bookmark-saved',
      isBookmarked: true,
    });
    const plain = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: 'vitest:bookmark-plain',
      isBookmarked: false,
    });

    const onlyBookmarked = await requestJson('/dreams?bookmarked=true', { headers: user.authHeaders });
    expect(onlyBookmarked.response.status).toBe(200);
    const savedIds = onlyBookmarked.json.data.items.map((d: { id: string }) => d.id);
    expect(savedIds).toContain(bookmarked.id);
    expect(savedIds).not.toContain(plain.id);
    expect(
      onlyBookmarked.json.data.items.every((d: { isBookmarked: boolean }) => d.isBookmarked === true),
    ).toBe(true);

    const onlyPlain = await requestJson('/dreams?bookmarked=false', { headers: user.authHeaders });
    const plainIds = onlyPlain.json.data.items.map((d: { id: string }) => d.id);
    expect(plainIds).toContain(plain.id);
    expect(plainIds).not.toContain(bookmarked.id);
  });
});
