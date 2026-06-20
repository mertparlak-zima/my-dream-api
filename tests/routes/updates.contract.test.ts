import { describe, expect, it } from 'vitest';

import { appRequest } from '../helpers/app';

/** Asserts the updates timeline served from migration data (0006_updates_data). */
async function json(path: string): Promise<{ status: number; body: { success: boolean; data: unknown } }> {
  const response = await appRequest(path);
  return { status: response.status, body: await response.json() };
}

type UpdateRow = {
  id: string;
  tag: string;
  is_new: boolean;
  published_at: string;
  title: string;
  body: string[];
};

describe('GET /updates (contract)', () => {
  it('returns updates newest-first (lang=tr)', async () => {
    const { status, body } = await json('/updates?lang=tr');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    const page = body.data as { items: UpdateRow[]; nextCursor: string | null };
    const rows = page.items;
    expect(rows.length).toBeGreaterThanOrEqual(5);

    const first = rows[0];
    expect(first.title).toBe('Müneccim Zühre artık aramızda');
    expect(first.tag).toBe('new_interpreter');
    expect(first.is_new).toBe(true);
    expect(Array.isArray(first.body)).toBe(true);
    expect(first.body.length).toBeGreaterThan(0);

    // Newest-first ordering by published_at.
    const dates = rows.map((r) => new Date(r.published_at).getTime());
    const sorted = [...dates].sort((a, b) => b - a);
    expect(dates).toEqual(sorted);
  });

  it('falls back to tr when the requested language is missing (lang=en)', async () => {
    const { status, body } = await json('/updates?lang=en');
    expect(status).toBe(200);
    const page = body.data as { items: UpdateRow[]; nextCursor: string | null };
    // title_en is null → coalesce returns the tr title.
    expect(page.items.some((r) => r.title === 'Rüyanı sesinle anlat')).toBe(true);
  });

  it('paginates with a cursor without overlap', async () => {
    const firstPage = (await json('/updates?lang=tr&limit=2')).body.data as {
      items: UpdateRow[];
      nextCursor: string | null;
    };
    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = (await json(`/updates?lang=tr&limit=2&cursor=${encodeURIComponent(firstPage.nextCursor!)}`))
      .body.data as { items: UpdateRow[]; nextCursor: string | null };
    expect(secondPage.items.length).toBeGreaterThan(0);

    // No overlap between pages.
    const firstIds = new Set(firstPage.items.map((r) => r.id));
    expect(secondPage.items.every((r) => !firstIds.has(r.id))).toBe(true);
  });

  it('rejects malformed cursors (bad base64, missing fields, invalid date)', async () => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

    const badBase64 = await json('/updates?lang=tr&cursor=not-a-valid-cursor');
    expect(badBase64.status).toBe(400);

    const missingFields = await json(`/updates?lang=tr&cursor=${encode({ slug: 'x' })}`);
    expect(missingFields.status).toBe(400);

    const invalidDate = await json(`/updates?lang=tr&cursor=${encode({ publishedAt: 'not-a-date', slug: 'x' })}`);
    expect(invalidDate.status).toBe(400);
  });
});
