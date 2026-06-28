import { PLAN_LIMITS } from '../../src/config';
import { PLAN, QUOTA_KEY } from '../../src/constants/domain';
import { userUsage } from '../../src/db/schema';
import { creditsService } from '../../src/features/credits/credits.service';
import { getWeekStartUtc } from '../../src/features/credits/quota-window';
import { createUserFixture, resetFixtures } from '../helpers/fixtures';
import { testDb } from '../helpers/db';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

describe('creditsService quota window behavior', () => {
  beforeEach(async () => {
    await resetFixtures();
  });

  afterEach(async () => {
    await resetFixtures();
  });

  it('reports zero used when the stored usage window has already rolled over', async () => {
    const now = new Date();
    const weekStart = getWeekStartUtc(now);
    const user = await createUserFixture({ plan: PLAN.FREE, extraCredits: 2 });

    // A usage row from a previous week must not count toward this week's quota.
    await testDb.insert(userUsage).values({
      userId: user.id,
      quotaKey: QUOTA_KEY.weekly_free_dream,
      windowStartedAt: new Date(weekStart.getTime() - WEEK_MS),
      usedCount: PLAN_LIMITS[PLAN.FREE],
    });

    const response = await creditsService.getCurrentCredits(user.id);

    expect(response).toEqual({
      plan: PLAN.FREE,
      weekly_dream_count: 0,
      weekly_limit: PLAN_LIMITS[PLAN.FREE],
      weekly_remaining: PLAN_LIMITS[PLAN.FREE],
      extra_credits: 2,
      limit_reset_date: new Date(weekStart.getTime() + WEEK_MS).toISOString(),
    });
  });

  it('counts usage from the current window against the weekly limit', async () => {
    const now = new Date();
    const weekStart = getWeekStartUtc(now);
    const user = await createUserFixture({ plan: PLAN.PRO, weeklyDreamCount: 2, extraCredits: 1 });

    const response = await creditsService.getCurrentCredits(user.id);

    expect(response).toEqual({
      plan: PLAN.PRO,
      weekly_dream_count: 2,
      weekly_limit: PLAN_LIMITS[PLAN.PRO],
      weekly_remaining: PLAN_LIMITS[PLAN.PRO] - 2,
      extra_credits: 1,
      limit_reset_date: new Date(weekStart.getTime() + WEEK_MS).toISOString(),
    });
  });
});
