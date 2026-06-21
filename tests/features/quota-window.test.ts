import { describe, expect, it } from 'vitest';

import { getDayStartUtc, getQuotaWindowStart, getWeekStartUtc } from '../../src/features/credits/quota-window';

describe('getWeekStartUtc', () => {
  it('returns Monday 00:00 UTC for a midweek Wednesday', () => {
    // 2026-06-17 is a Wednesday.
    const result = getWeekStartUtc(new Date('2026-06-17T14:30:00.000Z'));
    expect(result.toISOString()).toBe('2026-06-15T00:00:00.000Z'); // Monday
  });

  it('treats Sunday as the end of the week, not the start', () => {
    // 2026-06-21 is a Sunday — its week starts on Monday 2026-06-15.
    const result = getWeekStartUtc(new Date('2026-06-21T23:59:59.000Z'));
    expect(result.toISOString()).toBe('2026-06-15T00:00:00.000Z');
  });

  it('returns the same Monday when already at Monday 00:00 UTC', () => {
    const result = getWeekStartUtc(new Date('2026-06-15T00:00:00.000Z'));
    expect(result.toISOString()).toBe('2026-06-15T00:00:00.000Z');
  });

  it('ignores local timezone (uses UTC day boundary)', () => {
    // Late UTC Sunday that would be Monday in some local zones must still map to
    // the prior Monday's UTC week start.
    const result = getWeekStartUtc(new Date('2026-06-21T22:00:00.000Z'));
    expect(result.toISOString()).toBe('2026-06-15T00:00:00.000Z');
  });
});

describe('getDayStartUtc', () => {
  it('returns 00:00 UTC of the same day', () => {
    const result = getDayStartUtc(new Date('2026-06-17T14:30:00.000Z'));
    expect(result.toISOString()).toBe('2026-06-17T00:00:00.000Z');
  });
});

describe('getQuotaWindowStart', () => {
  it('uses the weekly Monday window for weekly_free_dream', () => {
    const result = getQuotaWindowStart('weekly_free_dream', new Date('2026-06-17T14:30:00.000Z'));
    expect(result.toISOString()).toBe('2026-06-15T00:00:00.000Z');
  });

  it('uses the daily window for subscription_daily_dream', () => {
    const result = getQuotaWindowStart('subscription_daily_dream', new Date('2026-06-17T14:30:00.000Z'));
    expect(result.toISOString()).toBe('2026-06-17T00:00:00.000Z');
  });
});
