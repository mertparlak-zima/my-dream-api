import { describe, expect, it } from 'vitest';

import {
  foldString,
  matchesAllTerms,
  normalizeSearch,
  searchTerms,
} from '../../src/utils/turkishSearch';

describe('turkishSearch', () => {
  it('folds Turkish lowercase + diacritics to ascii', () => {
    expect(foldString('YILAN')).toBe('yilan');
    expect(foldString('Güneş')).toBe('gunes');
    expect(foldString('Açık Köprü')).toBe('acik kopru');
    expect(foldString('Ağaç Şişe Ödül Îâû')).toBe('agac sise odul iau');
  });

  it('normalizes whitespace', () => {
    expect(normalizeSearch('  Açık   Deniz ')).toBe('acik deniz');
  });

  it('splits a query into normalized terms', () => {
    expect(searchTerms('Yılan  Deniz')).toEqual(['yilan', 'deniz']);
    expect(searchTerms('   ')).toEqual([]);
  });

  it('matches all terms (AND), and an empty term list matches anything', () => {
    expect(matchesAllTerms('Deniz su okyanus', ['deniz'])).toBe(true);
    expect(matchesAllTerms('Deniz su', ['deniz', 'su'])).toBe(true);
    expect(matchesAllTerms('Deniz su', ['deniz', 'yok'])).toBe(false);
    expect(matchesAllTerms('Güneş', ['gunes'])).toBe(true); // fold-aware
    expect(matchesAllTerms('anything', [])).toBe(true);
  });
});
