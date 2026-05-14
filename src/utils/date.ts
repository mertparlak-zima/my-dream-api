export function getNextWeeklyResetDate(now = new Date()): Date {
  const reset = new Date(now);
  const currentDay = reset.getUTCDay();
  const daysUntilSunday = (7 - currentDay) % 7;

  reset.setUTCDate(reset.getUTCDate() + daysUntilSunday);
  reset.setUTCHours(23, 0, 0, 0);

  if (reset <= now) {
    reset.setUTCDate(reset.getUTCDate() + 7);
  }

  return reset;
}
