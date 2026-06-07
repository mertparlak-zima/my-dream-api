import { describe, expect, it } from 'vitest';

import { appRequest } from '../helpers/app';

/**
 * Asserts the dictionary served from the data that ships via migration
 * (0004_reference_data) — no fixtures; the migration is the source of truth.
 */
async function json(path: string): Promise<{ status: number; body: { success: boolean; data: Record<string, unknown> } }> {
  const response = await appRequest(path);
  return { status: response.status, body: await response.json() };
}

type NamedRow = { name: string; related?: string[] };

describe('GET /dictionary (contract)', () => {
  it('returns categories, symbols and themes (lang=tr)', async () => {
    const { status, body } = await json('/dictionary?lang=tr');
    expect(status).toBe(200);
    const categories = body.data.categories as Array<{ id: string; label: string }>;
    const symbols = body.data.symbols as NamedRow[];
    const themes = body.data.themes as NamedRow[];
    expect(categories.some((c) => c.label === 'Su')).toBe(true);
    const deniz = symbols.find((s) => s.name === 'Deniz');
    expect(deniz?.related).toContain('Yağmur');
    expect(themes.some((t) => t.name === 'Kabuslar')).toBe(true);
  });

  it('falls back to tr when the requested language is missing (lang=en)', async () => {
    const { status, body } = await json('/dictionary?lang=en');
    expect(status).toBe(200);
    // name_en is null → coalesce returns the tr name.
    expect((body.data.symbols as NamedRow[]).some((s) => s.name === 'Yılan')).toBe(true);
  });

  it('search finds a match via the Turkish-folded DB column (fold-aware)', async () => {
    const { status, body } = await json('/dictionary/search?q=yilan'); // unaccented input
    expect(status).toBe(200);
    expect((body.data.symbols as NamedRow[]).some((s) => s.name === 'Yılan')).toBe(true);
    expect(body.data.empty).toBe(false);
  });

  it('search works with lang=en (search column falls back to tr)', async () => {
    const { status, body } = await json('/dictionary/search?q=deniz&lang=en');
    expect(status).toBe(200);
    expect((body.data.symbols as NamedRow[]).some((s) => s.name === 'Deniz')).toBe(true);
  });

  it('empty query returns the full set', async () => {
    const { status, body } = await json('/dictionary/search');
    expect(status).toBe(200);
    expect((body.data.symbols as NamedRow[]).length).toBeGreaterThan(0);
    expect(body.data.empty).toBe(false);
  });

  it('reports empty for a no-match query', async () => {
    const { status, body } = await json('/dictionary/search?q=zzzyokboyle');
    expect(status).toBe(200);
    expect(body.data.empty).toBe(true);
    expect((body.data.symbols as NamedRow[]).length).toBe(0);
  });
});
