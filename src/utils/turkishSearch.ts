/**
 * Turkish-aware search helpers for server-side dictionary search (#42).
 * Mirrors the app's `utils/search` folding so client and server rank the same
 * way: Turkish lowercase + 1:1 diacritic fold (ı→i, ş→s, ğ→g, ç→c, ö→o, ü→u …).
 */

/** Turkish lowercase + diacritic → ascii fold. */
export function foldString(input: string): string {
  return input
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ç/g, 'c')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i')
    .replace(/û/g, 'u');
}

/** Fold + collapse whitespace, for haystack/term comparison. */
export function normalizeSearch(input: string): string {
  return foldString(input).replace(/\s+/g, ' ').trim();
}

/** Split a query into normalized search terms. */
export function searchTerms(query: string): string[] {
  return normalizeSearch(query).split(' ').filter(Boolean);
}

/** True when every term appears somewhere in the haystack (AND match). */
export function matchesAllTerms(haystack: string, terms: string[]): boolean {
  if (terms.length === 0) {
    return true;
  }
  const folded = normalizeSearch(haystack);
  return terms.every((term) => folded.includes(term));
}
