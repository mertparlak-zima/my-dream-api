import { describe, expect, it } from 'vitest';

import { getInterpreterEnrichment } from '../../src/features/interpreters/interpreters.enrichment';

describe('interpreter enrichment', () => {
  it('returns rich content for a seeded interpreter id', () => {
    const selin = getInterpreterEnrichment('20000000-0000-4000-8000-000000000001');
    expect(selin.rating).toBe(4.7);
    expect(selin.reviews).toBe(980);
    expect(selin.styles).toContain('Analitik');
    expect(selin.story).toBeTruthy();
    expect(selin.samples.length).toBeGreaterThan(0);
    expect(selin.samples[0]).toHaveProperty('ctx');
    expect(selin.samples[0]).toHaveProperty('quote');
  });

  it('returns neutral defaults for an unknown id', () => {
    expect(getInterpreterEnrichment('unknown-id')).toEqual({
      rating: null,
      reviews: 0,
      styles: [],
      story: null,
      samples: [],
    });
  });
});
