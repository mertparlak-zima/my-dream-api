import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { PLAN, DREAM_STATUS } from '../../src/constants/domain';
import { dreams } from '../../src/db/schema';
import { appRequest } from '../helpers/app';
import {
  createAuthedUserFixture,
  createDreamFixture,
  createInterpreterFixture,
} from '../helpers/fixtures';
import { testDb } from '../helpers/db';
import { setupDatabaseTestFile } from '../helpers/lifecycle';

async function requestJson(
  path: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  },
) {
  const response = await appRequest(path, {
    method: init?.method,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });

  return {
    response,
    json: await response.json(),
  };
}

describe('roadmap 0008 route contracts', () => {
  setupDatabaseTestFile();

  it('GET / returns the API root envelope', async () => {
    const response = await appRequest('/');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: 'My Dream API v1.0',
    });
  });

  it('GET /health returns the success envelope', async () => {
    const response = await appRequest('/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      status: 'ok',
      redis: 'disabled',
    });
  });

  it('does not emit CORS allow-origin when no origin allowlist is configured', async () => {
    const response = await appRequest('/health', {
      headers: { Origin: 'https://example.com' },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('GET /openapi.json returns parseable OpenAPI JSON with key documented paths', async () => {
    const response = await appRequest('/openapi.json');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(body).toMatchObject({
      openapi: '3.0.0',
      info: {
        title: 'My Dream API',
        version: '1.0.0',
        description: 'Dream interpretation API for My Dream mobile app.',
      },
    });
    expect(body.servers?.[0]?.url).toBeTypeOf('string');
    expect(body.paths).toEqual(
      expect.objectContaining({
        '/dreams': expect.any(Object),
        '/dreams/{id}': expect.any(Object),
        '/credits/me': expect.any(Object),
        '/interpreters': expect.any(Object),
      }),
    );
  });

  it('GET /docs returns an HTML smoke response', async () => {
    const response = await appRequest('/docs');
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(body).toContain('My Dream API Reference');
  });

  it('returns the JSON not-found envelope for unknown routes', async () => {
    const response = await appRequest('/does-not-exist');
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Kaynak bulunamadı.',
      },
    });
  });

  it('GET /credits/me without auth returns a 401 UNAUTHORIZED envelope', async () => {
    const { response, json } = await requestJson('/credits/me');

    expect(response.status).toBe(401);
    expect(json).toEqual({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: expect.any(String),
      },
    });
  });

  it('GET /interpreters returns active interpreters and excludes inactive ones', async () => {
    const active = await createInterpreterFixture({
      name: 'vitest:active-interpreter',
      description: 'vitest:active-description',
      isActive: true,
      sortOrder: 5,
    });
    const inactive = await createInterpreterFixture({
      name: 'vitest:inactive-interpreter',
      description: 'vitest:inactive-description',
      isActive: false,
      sortOrder: 1,
    });

    const { response, json } = await requestJson('/interpreters');

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: active.id,
          name: 'vitest:active-interpreter',
          description: 'vitest:active-description',
          image_url: null,
          is_premium: false,
          sort_order: 5,
        }),
      ]),
    );
    expect(json.data).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: inactive.id,
        }),
      ]),
    );
  });

  it('GET /interpreters/:id returns a NOT_FOUND envelope when missing', async () => {
    const { response, json } = await requestJson(`/interpreters/${crypto.randomUUID()}`);

    expect(response.status).toBe(404);
    expect(json).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: expect.any(String),
      },
    });
  });

  it('GET /interpreters/:id returns the active interpreter contract', async () => {
    const interpreter = await createInterpreterFixture({
      name: 'vitest:detail-interpreter',
      description: 'vitest:detail-description',
      isPremium: true,
      sortOrder: 9,
    });

    const { response, json } = await requestJson(`/interpreters/${interpreter.id}`);

    expect(response.status).toBe(200);
    expect(json).toEqual({
      success: true,
      data: {
        id: interpreter.id,
        name: 'vitest:detail-interpreter',
        description: 'vitest:detail-description',
        image_url: null,
        is_premium: true,
        sort_order: 9,
        // Enrichment (#41): a fixture interpreter has no enrichment → defaults.
        rating: null,
        reviews: 0,
        styles: [],
        story: null,
        samples: [],
      },
    });
  });

  it('GET /credits/me returns the current user credit summary', async () => {
    const user = await createAuthedUserFixture({
      plan: PLAN.PRO,
      weeklyDreamCount: 2,
      extraCredits: 4,
    });

    const { response, json } = await requestJson('/credits/me', {
      headers: user.authHeaders,
    });

    expect(response.status).toBe(200);
    expect(json).toEqual({
      success: true,
      data: {
        plan: 'PRO',
        weekly_dream_count: 2,
        weekly_limit: 7,
        weekly_remaining: 5,
        extra_credits: 4,
        limit_reset_date: expect.any(String),
      },
    });
  });

  it('GET /credits/me returns NOT_FOUND for an authenticated user id that does not exist', async () => {
    const { response, json } = await requestJson('/credits/me', {
      headers: { 'X-Dev-User-Id': crypto.randomUUID() },
    });

    expect(response.status).toBe(404);
    expect(json).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: expect.any(String),
      },
    });
  });

  it('POST /dreams returns a 202 success envelope for a valid request', async () => {
    const user = await createAuthedUserFixture();
    const interpreter = await createInterpreterFixture();

    const { response, json } = await requestJson('/dreams', {
      method: 'POST',
      headers: user.authHeaders,
      body: {
        content: 'I was walking through a quiet hallway toward an open window.',
        interpreter_id: interpreter.id,
      },
    });

    expect(response.status).toBe(202);
    expect(json).toEqual({
      success: true,
      data: {
        id: expect.any(String),
        content: 'I was walking through a quiet hallway toward an open window.',
        status: 'PENDING',
        interpretation: null,
        interpreter: expect.objectContaining({
          id: interpreter.id,
        }),
        mood: null,
        rating: null,
        feedback: null,
        isBookmarked: false,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });
  });

  it('GET /dreams returns a summary page contract with cursor pagination for the current user', async () => {
    const user = await createAuthedUserFixture();
    const otherUser = await createAuthedUserFixture();
    const interpreter = await createInterpreterFixture();
    for (let index = 0; index < 25; index += 1) {
      const dream = await createDreamFixture({
        userId: user.id,
        interpreterId: interpreter.id,
        content: `vitest:user-dream-${index + 1}`,
        status: index % 2 === 0 ? DREAM_STATUS.PENDING : DREAM_STATUS.COMPLETED,
        interpretation: index % 2 === 0 ? null : `vitest:interpretation-${index + 1}`,
      });

      const timestamp = new Date(Date.UTC(2024, 0, index + 1, 0, 0, 0, 0));
      await testDb
        .update(dreams)
        .set({
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .where(eq(dreams.id, dream.id));
    }

    for (let index = 0; index < 3; index += 1) {
      await createDreamFixture({
        userId: otherUser.id,
        interpreterId: interpreter.id,
        content: `vitest:other-user-dream-${index + 1}`,
        status: DREAM_STATUS.PENDING,
      });
    }

    const { response, json } = await requestJson('/dreams', {
      headers: user.authHeaders,
    });

    expect(response.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.items).toHaveLength(20);
    expect(json.data.nextCursor).toEqual(expect.any(String));
    expect(json.data.items.every((dream: { content: string }) => dream.content.startsWith('vitest:user-dream-'))).toBe(true);
    expect(json.data.items.every((dream: { interpreter: unknown }) => dream.interpreter === undefined)).toBe(true);
    expect(json.data.items.every((dream: { interpretation: unknown }) => dream.interpretation === undefined)).toBe(true);

    const secondPage = await requestJson(`/dreams?cursor=${encodeURIComponent(json.data.nextCursor)}`, {
      headers: user.authHeaders,
    });

    expect(secondPage.response.status).toBe(200);
    expect(secondPage.json.data.items).toHaveLength(5);
    expect(secondPage.json.data.nextCursor).toBeNull();
    expect(secondPage.json.data.items.map((dream: { content: string }) => dream.content)).toEqual([
      'vitest:user-dream-5',
      'vitest:user-dream-4',
      'vitest:user-dream-3',
      'vitest:user-dream-2',
      'vitest:user-dream-1',
    ]);
  });

  it('GET /dreams/:id returns the owner dream contract and NOT_FOUND for another authenticated user', async () => {
    const user = await createAuthedUserFixture();
    const otherUser = await createAuthedUserFixture();
    const interpreter = await createInterpreterFixture({
      name: 'vitest:route-detail-interpreter',
      description: 'vitest:route-detail-description',
      sortOrder: 6,
    });
    const dream = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: 'vitest:route-detail-dream',
      interpretation: 'vitest:route-detail-interpretation',
      status: DREAM_STATUS.COMPLETED,
      userRating: 8,
      userFeedbackText: 'vitest:route-detail-feedback',
    });

    const ownerResult = await requestJson(`/dreams/${dream.id}`, {
      headers: user.authHeaders,
    });

    expect(ownerResult.response.status).toBe(200);
    expect(ownerResult.json).toEqual({
      success: true,
      data: {
        id: dream.id,
        content: 'vitest:route-detail-dream',
        status: 'COMPLETED',
        interpretation: 'vitest:route-detail-interpretation',
        interpreter: {
          id: interpreter.id,
          name: 'vitest:route-detail-interpreter',
          specialty: 'vitest:route-detail-description',
          description: 'vitest:route-detail-description',
          imageUrl: null,
          isPremium: false,
          sortOrder: 6,
        },
        mood: null,
        rating: 8,
        feedback: 'vitest:route-detail-feedback',
        isBookmarked: false,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
    });

    const otherUserResult = await requestJson(`/dreams/${dream.id}`, {
      headers: otherUser.authHeaders,
    });

    expect(otherUserResult.response.status).toBe(404);
    expect(otherUserResult.json).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: expect.any(String),
      },
    });
  });

  it('PATCH /dreams/:id/feedback returns a validation envelope for an invalid rating', async () => {
    const user = await createAuthedUserFixture();
    const interpreter = await createInterpreterFixture();
    const dream = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      status: DREAM_STATUS.COMPLETED,
      interpretation: 'vitest:completed-interpretation',
    });

    const { response, json } = await requestJson(`/dreams/${dream.id}/feedback`, {
      method: 'PATCH',
      headers: user.authHeaders,
      body: {
        rating: 99,
      },
    });

    expect(response.status).toBe(400);
    expect(json).toEqual({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: expect.any(String),
        issues: expect.any(Array),
      },
    });
  });
});
