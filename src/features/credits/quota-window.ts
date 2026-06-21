import type { QuotaKey } from '../../constants/domain';
import { QUOTA_KEY } from '../../constants/domain';

/**
 * Start of the current ISO week (Monday 00:00:00.000 UTC) for `now`.
 * Anchored to UTC so a client cannot shift its quota window by changing the
 * device timezone.
 */
export function getWeekStartUtc(now: Date): Date {
  const start = new Date(now);
  // getUTCDay(): 0=Sun..6=Sat. Days since Monday = (day + 6) % 7.
  const daysSinceMonday = (start.getUTCDay() + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

/** Start of the current day (00:00:00.000 UTC) for `now`. */
export function getDayStartUtc(now: Date): Date {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

/**
 * Resolves the window-start timestamp for a quota key. The free weekly quota
 * rolls every Monday 00:00 UTC; the subscription quota rolls daily at 00:00 UTC.
 * The per-plan limit is resolved by the caller (where plan context is known).
 */
export function getQuotaWindowStart(quotaKey: QuotaKey, now: Date): Date {
  return quotaKey === QUOTA_KEY.weekly_free_dream ? getWeekStartUtc(now) : getDayStartUtc(now);
}
