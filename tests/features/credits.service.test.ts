import { eq } from 'drizzle-orm';
import { PLAN_LIMITS } from '../../src/config';
import { PLAN } from '../../src/constants/domain';
import { creditsService } from '../../src/features/credits/credits.service';
import { getNextWeeklyResetDate } from '../../src/utils/date';
import { users } from '../../src/db/schema';
import { createUserFixture, resetFixtures } from '../helpers/fixtures';
import { testDb } from '../helpers/db';

describe('creditsService weekly reset behavior', () => {
  beforeEach(async () => {
    vi.useRealTimers();
    await resetFixtures();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    await resetFixtures();
  });

  it('resets expired weekly credits before returning the current credit view', async () => {
    const now = new Date();

    const user = await createUserFixture({
      plan: PLAN.FREE,
      weeklyDreamCount: PLAN_LIMITS[PLAN.FREE],
      extraCredits: 2,
      limitResetDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    });

    const response = await creditsService.getCurrentCredits(user.id);

    expect(response).toEqual({
      plan: PLAN.FREE,
      weekly_dream_count: 0,
      weekly_limit: PLAN_LIMITS[PLAN.FREE],
      weekly_remaining: PLAN_LIMITS[PLAN.FREE],
      extra_credits: 2,
      limit_reset_date: getNextWeeklyResetDate(now).toISOString(),
    });

    const storedUser = await testDb.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: {
        weeklyDreamCount: true,
        limitResetDate: true,
      },
    });

    expect(storedUser).toMatchObject({
      weeklyDreamCount: 0,
      limitResetDate: getNextWeeklyResetDate(now),
    });
  });

  it('keeps active weekly credits untouched when the reset date is still in the future', async () => {
    const now = new Date();
    const activeResetDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const user = await createUserFixture({
      plan: PLAN.PRO,
      weeklyDreamCount: 2,
      extraCredits: 1,
      limitResetDate: activeResetDate,
    });

    const response = await creditsService.getCurrentCredits(user.id);

    expect(response).toEqual({
      plan: PLAN.PRO,
      weekly_dream_count: 2,
      weekly_limit: PLAN_LIMITS[PLAN.PRO],
      weekly_remaining: PLAN_LIMITS[PLAN.PRO] - 2,
      extra_credits: 1,
      limit_reset_date: activeResetDate.toISOString(),
    });

    const storedUser = await testDb.query.users.findFirst({
      where: eq(users.id, user.id),
      columns: {
        weeklyDreamCount: true,
        limitResetDate: true,
      },
    });

    expect(storedUser).toMatchObject({
      weeklyDreamCount: 2,
      limitResetDate: activeResetDate,
    });
  });
});
