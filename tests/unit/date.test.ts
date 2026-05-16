import { describe, expect, it } from 'vitest';
import { getNextWeeklyResetDate } from '../../src/utils/date';

describe('getNextWeeklyResetDate', () => {
  it('returns the same Sunday at 23:00 UTC when the reset time is still ahead', () => {
    const now = new Date('2026-05-17T10:30:00.000Z');

    expect(getNextWeeklyResetDate(now).toISOString()).toBe('2026-05-17T23:00:00.000Z');
  });

  it('moves to the following Sunday when the computed reset is not after now', () => {
    const now = new Date('2026-05-17T23:00:00.000Z');

    expect(getNextWeeklyResetDate(now).toISOString()).toBe('2026-05-24T23:00:00.000Z');
  });
});
