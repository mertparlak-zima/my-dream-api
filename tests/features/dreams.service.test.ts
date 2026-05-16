import { eq } from 'drizzle-orm';
import { PLAN_LIMITS } from '../../src/config';
import { CREDIT_TRANSACTION_TYPE, DREAM_STATUS, PLAN } from '../../src/constants/domain';
import { CreditError } from '../../src/errors/CreditError';
import { ForbiddenError } from '../../src/errors/ForbiddenError';
import { NotFoundError } from '../../src/errors/NotFoundError';
import { ValidationError } from '../../src/errors/ValidationError';
import { db } from '../../src/db';
import { creditTransactions, dreams, users } from '../../src/db/schema';
import { dreamsService } from '../../src/features/dreams/dreams.service';
import {
  createDreamFixture,
  createInterpreterFixture,
  createUserFixture,
  resetFixtures,
} from '../helpers/fixtures';
import { testDb } from '../helpers/db';
import {
  processDreamImmediately,
  processDreamWithDelay,
  scheduleDreamProcessing,
} from '../helpers/dreamsProcessing';

async function getUserCredits(userId: string) {
  const user = await testDb.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      weeklyDreamCount: true,
      extraCredits: true,
    },
  });

  expect(user).toBeTruthy();
  return user!;
}

async function getDreamTransactions(dreamId: string) {
  return testDb.query.creditTransactions.findMany({
    where: eq(creditTransactions.relatedDreamId, dreamId),
    orderBy: (fields, { asc }) => [asc(fields.createdAt)],
  });
}

async function getUserTransactions(userId: string) {
  return testDb.query.creditTransactions.findMany({
    where: eq(creditTransactions.userId, userId),
    orderBy: (fields, { asc }) => [asc(fields.createdAt)],
  });
}

async function getUserDreams(userId: string) {
  return testDb.query.dreams.findMany({
    where: eq(dreams.userId, userId),
    orderBy: (fields, { asc }) => [asc(fields.createdAt)],
  });
}

async function sleepFor(ms: number) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForDreamStatus(dreamId: string, status: DREAM_STATUS, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const dream = await testDb.query.dreams.findFirst({
      where: eq(dreams.id, dreamId),
      columns: {
        status: true,
        interpretation: true,
      },
    });

    if (dream?.status === status) {
      return dream;
    }

    await sleepFor(25);
  }

  throw new Error(`Dream ${dreamId} did not reach status ${status} within ${timeoutMs}ms.`);
}

describe('dreamsService credit behavior', () => {
  beforeEach(async () => {
    vi.useRealTimers();
    await resetFixtures();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    await resetFixtures();
  });

  it('uses weekly credit, increments weeklyDreamCount, creates a dream, and inserts USED_WEEKLY', async () => {
    const user = await createUserFixture({ plan: PLAN.FREE, weeklyDreamCount: 0, extraCredits: 3 });
    const interpreter = await createInterpreterFixture();

    const response = await dreamsService.createDream(user.id, {
      content: 'vitest: dream content for weekly credit',
      interpreter_id: interpreter.id,
    });

    expect(response.status).toBe(DREAM_STATUS.PENDING);

    const [storedDream] = await getUserDreams(user.id);
    expect(storedDream).toBeTruthy();
    expect(storedDream?.id).toBe(response.id);
    expect(storedDream?.status).toBe(DREAM_STATUS.PENDING);

    const updatedUser = await getUserCredits(user.id);
    expect(updatedUser.weeklyDreamCount).toBe(1);
    expect(updatedUser.extraCredits).toBe(3);

    const transactions = await getDreamTransactions(response.id);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.transactionType).toBe(CREDIT_TRANSACTION_TYPE.USED_WEEKLY);
    expect(transactions[0]?.amount).toBe(1);
  });

  it('uses extra credit after the weekly limit is reached and inserts USED_EXTRA', async () => {
    const user = await createUserFixture({
      plan: PLAN.FREE,
      weeklyDreamCount: PLAN_LIMITS[PLAN.FREE],
      extraCredits: 2,
    });
    const interpreter = await createInterpreterFixture();

    const response = await dreamsService.createDream(user.id, {
      content: 'vitest: dream content using extra credit',
      interpreter_id: interpreter.id,
    });

    const updatedUser = await getUserCredits(user.id);
    expect(updatedUser.weeklyDreamCount).toBe(PLAN_LIMITS[PLAN.FREE]);
    expect(updatedUser.extraCredits).toBe(1);

    const transactions = await getDreamTransactions(response.id);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.transactionType).toBe(CREDIT_TRANSACTION_TYPE.USED_EXTRA);
  });

  it('throws CreditError with insufficient credits and leaves no dream, transaction, or counter mutation', async () => {
    const user = await createUserFixture({
      plan: PLAN.FREE,
      weeklyDreamCount: PLAN_LIMITS[PLAN.FREE],
      extraCredits: 0,
    });
    const interpreter = await createInterpreterFixture();

    await expect(
      dreamsService.createDream(user.id, {
        content: 'vitest: dream content with no remaining credits',
        interpreter_id: interpreter.id,
      }),
    ).rejects.toBeInstanceOf(CreditError);

    const updatedUser = await getUserCredits(user.id);
    expect(updatedUser.weeklyDreamCount).toBe(PLAN_LIMITS[PLAN.FREE]);
    expect(updatedUser.extraCredits).toBe(0);
    expect(await getUserDreams(user.id)).toHaveLength(0);
    expect(await getUserTransactions(user.id)).toHaveLength(0);
  });

  it('rejects premium interpreters for FREE users and keeps credits unchanged', async () => {
    const user = await createUserFixture({ plan: PLAN.FREE, weeklyDreamCount: 0, extraCredits: 2 });
    const interpreter = await createInterpreterFixture({ isPremium: true });

    await expect(
      dreamsService.createDream(user.id, {
        content: 'vitest: premium interpreter should be forbidden',
        interpreter_id: interpreter.id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const updatedUser = await getUserCredits(user.id);
    expect(updatedUser.weeklyDreamCount).toBe(0);
    expect(updatedUser.extraCredits).toBe(2);
    expect(await getUserDreams(user.id)).toHaveLength(0);
  });

  it('rejects invalid or inactive interpreters and keeps credits unchanged', async () => {
    const user = await createUserFixture({ plan: PLAN.PRO, weeklyDreamCount: 0, extraCredits: 2 });
    const inactiveInterpreter = await createInterpreterFixture({ isActive: false });
    const initialCredits = await getUserCredits(user.id);

    await expect(
      dreamsService.createDream(user.id, {
        content: 'vitest: inactive interpreter should be missing',
        interpreter_id: inactiveInterpreter.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      dreamsService.createDream(user.id, {
        content: 'vitest: invalid interpreter should be missing',
        interpreter_id: crypto.randomUUID(),
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const updatedUser = await getUserCredits(user.id);
    expect(updatedUser).toEqual(initialCredits);
    expect(await getUserDreams(user.id)).toHaveLength(0);
  });

  it('rejects dream creation when the user does not exist', async () => {
    const interpreter = await createInterpreterFixture();

    await expect(
      dreamsService.createDream(crypto.randomUUID(), {
        content: 'vitest: missing user cannot create a dream',
        interpreter_id: interpreter.id,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('returns a dream by id for the owning user and rejects missing dreams', async () => {
    const user = await createUserFixture();
    const otherUser = await createUserFixture();
    const interpreter = await createInterpreterFixture({
      name: 'vitest: detail interpreter',
      description: 'vitest: detail description',
      sortOrder: 3,
    });
    const dream = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: 'vitest: get dream by id',
      interpretation: 'vitest: stored interpretation',
      status: DREAM_STATUS.COMPLETED,
      userRating: 5,
      userFeedbackText: 'vitest: stored feedback',
    });

    const response = await dreamsService.getDreamById(user.id, dream.id);

    expect(response).toMatchObject({
      id: dream.id,
      content: 'vitest: get dream by id',
      status: DREAM_STATUS.COMPLETED,
      interpretation: 'vitest: stored interpretation',
      rating: 5,
      feedback: 'vitest: stored feedback',
      interpreter: {
        id: interpreter.id,
        name: 'vitest: detail interpreter',
        specialty: 'vitest: detail description',
        description: 'vitest: detail description',
        imageUrl: null,
        isPremium: false,
        sortOrder: 3,
      },
    });

    await expect(dreamsService.getDreamById(otherUser.id, dream.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(dreamsService.getDreamById(user.id, crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lists only the current user dreams in reverse chronological order', async () => {
    const user = await createUserFixture();
    const otherUser = await createUserFixture();
    const interpreter = await createInterpreterFixture({
      name: 'vitest: list interpreter',
      description: 'vitest: list description',
      sortOrder: 4,
    });
    const olderDream = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: 'vitest: older dream',
      status: DREAM_STATUS.COMPLETED,
      interpretation: 'vitest: older interpretation',
    });
    const newerDream = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: 'vitest: newer dream',
      status: DREAM_STATUS.PENDING,
    });
    await createDreamFixture({
      userId: otherUser.id,
      interpreterId: interpreter.id,
      content: 'vitest: other user dream',
      status: DREAM_STATUS.COMPLETED,
    });

    await testDb
      .update(dreams)
      .set({
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      })
      .where(eq(dreams.id, olderDream.id));

    await testDb
      .update(dreams)
      .set({
        createdAt: new Date('2024-01-02T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
      })
      .where(eq(dreams.id, newerDream.id));

    const response = await dreamsService.listDreams(user.id, { limit: 10 });

    expect(response.map((dream) => dream.id)).toEqual([newerDream.id, olderDream.id]);
    expect(response[0]).toMatchObject({
      id: newerDream.id,
      content: 'vitest: newer dream',
      status: DREAM_STATUS.PENDING,
      interpreter: {
        id: interpreter.id,
        name: 'vitest: list interpreter',
        specialty: 'vitest: list description',
        description: 'vitest: list description',
        imageUrl: null,
        isPremium: false,
        sortOrder: 4,
      },
    });
    expect(response[1]).toMatchObject({
      id: olderDream.id,
      interpretation: 'vitest: older interpretation',
      status: DREAM_STATUS.COMPLETED,
    });
  });

  it('forbids feedback on PENDING dreams', async () => {
    const user = await createUserFixture();
    const interpreter = await createInterpreterFixture();
    const dream = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: 'vitest: feedback should fail while pending',
      status: DREAM_STATUS.PENDING,
    });

    await expect(
      dreamsService.submitFeedback(user.id, dream.id, {
        rating: 4,
        feedback_text: 'still pending',
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('stores completed dream feedback and returns the serialized response', async () => {
    const user = await createUserFixture();
    const interpreter = await createInterpreterFixture({
      name: 'vitest: interpreter completed',
      description: 'vitest: deep interpretation',
      isPremium: false,
      sortOrder: 7,
    });
    const dream = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: 'vitest: completed dream feedback',
      interpretation: 'vitest: interpretation text',
      status: DREAM_STATUS.COMPLETED,
    });

    const response = await dreamsService.submitFeedback(user.id, dream.id, {
      rating: 9,
      feedback_text: 'vitest: very accurate',
    });

    expect(response.id).toBe(dream.id);
    expect(response.status).toBe(DREAM_STATUS.COMPLETED);
    expect(response.rating).toBe(9);
    expect(response.feedback).toBe('vitest: very accurate');
    expect(response.interpreter).toEqual({
      id: interpreter.id,
      name: 'vitest: interpreter completed',
      specialty: 'vitest: deep interpretation',
      description: 'vitest: deep interpretation',
      imageUrl: null,
      isPremium: false,
      sortOrder: 7,
    });

    const storedDream = await testDb.query.dreams.findFirst({
      where: eq(dreams.id, dream.id),
      columns: {
        userRating: true,
        userFeedbackText: true,
      },
    });
    expect(storedDream).toEqual({
      userRating: 9,
      userFeedbackText: 'vitest: very accurate',
    });
  });

  it('stores feedback with a null text value when feedback_text is omitted', async () => {
    const user = await createUserFixture();
    const interpreter = await createInterpreterFixture();
    const dream = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: 'vitest: completed dream feedback without text',
      interpretation: 'vitest: interpretation text',
      status: DREAM_STATUS.COMPLETED,
    });

    const response = await dreamsService.submitFeedback(user.id, dream.id, {
      rating: 7,
    });

    expect(response.rating).toBe(7);
    expect(response.feedback).toBeNull();

    const storedDream = await testDb.query.dreams.findFirst({
      where: eq(dreams.id, dream.id),
      columns: {
        userRating: true,
        userFeedbackText: true,
      },
    });
    expect(storedDream).toEqual({
      userRating: 7,
      userFeedbackText: null,
    });
  });

  it('throws ValidationError when a completed dream feedback update returns no row', async () => {
    const user = await createUserFixture();
    const interpreter = await createInterpreterFixture();
    const dream = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: 'vitest: completed dream feedback deleted during update',
      interpretation: 'vitest: interpretation text',
      status: DREAM_STATUS.COMPLETED,
    });

    vi.spyOn(db, 'update').mockImplementationOnce(() => ({
      set: () => ({
        where: () => ({
          returning: async () => [],
        }),
      }),
    }) as never);

    await expect(
      dreamsService.submitFeedback(user.id, dream.id, {
        rating: 6,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('completes delayed mock processing and truncates long interpretation excerpts', async () => {
    const user = await createUserFixture({ plan: PLAN.PRO, weeklyDreamCount: 0, extraCredits: 1 });
    const interpreter = await createInterpreterFixture({
      name: 'vitest: scheduler interpreter',
    });
    const longContent = `  ${'moonlight '.repeat(30)}${'echo '.repeat(20)}  `;

    const dream = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: longContent,
      status: DREAM_STATUS.PENDING,
    });

    const processingPromise = processDreamWithDelay(dream.id, 25);
    await waitForDreamStatus(dream.id, DREAM_STATUS.PROCESSING, 1000);
    await processingPromise;

    const storedDream = await waitForDreamStatus(dream.id, DREAM_STATUS.COMPLETED, 1000);

    const normalizedContent = longContent.replace(/\s+/g, ' ').trim();
    const excerpt = `${normalizedContent.slice(0, 220)}...`;

    expect(storedDream.interpretation).toContain('vitest: scheduler interpreter yorumu');
    expect(storedDream.interpretation).toContain(`Ana iz: "${excerpt}"`);
    expect(storedDream.interpretation).not.toContain(normalizedContent);
  }, 10000);

  it('completes delayed mock processing without truncating short content excerpts', async () => {
    const user = await createUserFixture();
    const interpreter = await createInterpreterFixture({
      name: 'vitest: short interpreter',
    });
    const shortContent = '  vitest: short symbolic river dream  ';
    const dream = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: shortContent,
      status: DREAM_STATUS.PENDING,
    });

    await processDreamWithDelay(dream.id, 1);

    const storedDream = await waitForDreamStatus(dream.id, DREAM_STATUS.COMPLETED, 1000);
    const normalizedContent = shortContent.replace(/\s+/g, ' ').trim();

    expect(storedDream.interpretation).toContain(`Ana iz: "${normalizedContent}"`);
  });

  it('marks [mock-fail] dreams as FAILED and keeps a single REFUNDED transaction even on duplicate refund attempts', async () => {
    const user = await createUserFixture({ plan: PLAN.FREE, weeklyDreamCount: 0, extraCredits: 0 });
    const interpreter = await createInterpreterFixture();

    const response = await dreamsService.createDream(user.id, {
      content: 'vitest: [mock-fail] refund this dream please',
      interpreter_id: interpreter.id,
    });

    await processDreamImmediately(response.id);

    const failedDream = await testDb.query.dreams.findFirst({
      where: eq(dreams.id, response.id),
      columns: { status: true },
    });
    expect(failedDream?.status).toBe(DREAM_STATUS.FAILED);

    await testDb
      .update(dreams)
      .set({ status: DREAM_STATUS.PENDING, updatedAt: new Date() })
      .where(eq(dreams.id, response.id));
    await processDreamImmediately(response.id);

    const transactions = await getDreamTransactions(response.id);
    expect(transactions.map((transaction) => transaction.transactionType)).toEqual([
      CREDIT_TRANSACTION_TYPE.USED_WEEKLY,
      CREDIT_TRANSACTION_TYPE.REFUNDED,
    ]);
  });

  it('refunds restore the correct credit source for weekly and extra spends', async () => {
    const interpreter = await createInterpreterFixture();
    const weeklyUser = await createUserFixture({ plan: PLAN.FREE, weeklyDreamCount: 0, extraCredits: 0 });
    const extraUser = await createUserFixture({
      plan: PLAN.FREE,
      weeklyDreamCount: PLAN_LIMITS[PLAN.FREE],
      extraCredits: 2,
    });

    const weeklyDream = await dreamsService.createDream(weeklyUser.id, {
      content: 'vitest: [mock-fail] weekly refund source check',
      interpreter_id: interpreter.id,
    });
    const extraDream = await dreamsService.createDream(extraUser.id, {
      content: 'vitest: [mock-fail] extra refund source check',
      interpreter_id: interpreter.id,
    });

    await processDreamImmediately(weeklyDream.id);
    await processDreamImmediately(extraDream.id);

    const weeklyCredits = await getUserCredits(weeklyUser.id);
    expect(weeklyCredits.weeklyDreamCount).toBe(0);
    expect(weeklyCredits.extraCredits).toBe(0);

    const extraCredits = await getUserCredits(extraUser.id);
    expect(extraCredits.weeklyDreamCount).toBe(PLAN_LIMITS[PLAN.FREE]);
    expect(extraCredits.extraCredits).toBe(2);
  });

  it('marks [mock-fail] fixture dreams as FAILED without refund when no spend transaction exists', async () => {
    const user = await createUserFixture({ plan: PLAN.FREE, weeklyDreamCount: 0, extraCredits: 2 });
    const interpreter = await createInterpreterFixture();
    const dream = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: 'vitest: [mock-fail] fixture dream without spend transaction',
      status: DREAM_STATUS.PENDING,
    });

    await processDreamImmediately(dream.id);

    const storedDream = await testDb.query.dreams.findFirst({
      where: eq(dreams.id, dream.id),
      columns: { status: true },
    });
    expect(storedDream?.status).toBe(DREAM_STATUS.FAILED);
    expect(await getDreamTransactions(dream.id)).toHaveLength(0);

    const updatedUser = await getUserCredits(user.id);
    expect(updatedUser.weeklyDreamCount).toBe(0);
    expect(updatedUser.extraCredits).toBe(2);
  });

  it('returns early when mock processing cannot claim a pending dream or the dream leaves PROCESSING before completion', async () => {
    await expect(processDreamImmediately(crypto.randomUUID())).resolves.toBeUndefined();

    const user = await createUserFixture();
    const interpreter = await createInterpreterFixture();
    const completedDream = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: 'vitest: already completed dream',
      interpretation: 'vitest: complete',
      status: DREAM_STATUS.COMPLETED,
    });

    await processDreamImmediately(completedDream.id);

    const unchangedDream = await testDb.query.dreams.findFirst({
      where: eq(dreams.id, completedDream.id),
      columns: {
        status: true,
        interpretation: true,
      },
    });
    expect(unchangedDream).toEqual({
      status: DREAM_STATUS.COMPLETED,
      interpretation: 'vitest: complete',
    });

    const pendingDream = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: 'vitest: pending dream that will leave processing',
      status: DREAM_STATUS.PENDING,
    });

    const processingPromise = processDreamWithDelay(pendingDream.id, 50);
    await waitForDreamStatus(pendingDream.id, DREAM_STATUS.PROCESSING, 1000);

    await testDb
      .update(dreams)
      .set({
        status: DREAM_STATUS.FAILED,
        updatedAt: new Date(),
      })
      .where(eq(dreams.id, pendingDream.id));

    await processingPromise;

    const inFlightDream = await testDb.query.dreams.findFirst({
      where: eq(dreams.id, pendingDream.id),
      columns: {
        status: true,
        interpretation: true,
      },
    });
    expect(inFlightDream).toEqual({
      status: DREAM_STATUS.FAILED,
      interpretation: null,
    });
  });

  it('logs background worker errors when scheduled mock processing rejects', async () => {
    vi.useFakeTimers();

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(db, 'update').mockImplementationOnce(() => {
      throw new Error('vitest: scheduled processing failed');
    });

    scheduleDreamProcessing(crypto.randomUUID());
    await vi.advanceTimersByTimeAsync(300);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[DREAM_MOCK_WORKER_ERROR]',
      expect.objectContaining({ message: 'vitest: scheduled processing failed' }),
    );
  });

  it('prevents concurrent submissions from overspending weekly credits', async () => {
    const user = await createUserFixture({
      plan: PLAN.FREE,
      weeklyDreamCount: 0,
      extraCredits: 0,
    });
    const interpreter = await createInterpreterFixture();

    const results = await Promise.allSettled([
      dreamsService.createDream(user.id, {
        content: 'vitest: concurrent dream one',
        interpreter_id: interpreter.id,
      }),
      dreamsService.createDream(user.id, {
        content: 'vitest: concurrent dream two',
        interpreter_id: interpreter.id,
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.status).toBe('rejected');
    if (rejected[0]?.status === 'rejected') {
      expect(rejected[0].reason).toBeInstanceOf(CreditError);
    }

    const updatedUser = await getUserCredits(user.id);
    expect(updatedUser.weeklyDreamCount).toBe(1);
    expect(updatedUser.extraCredits).toBe(0);
    expect(await getUserDreams(user.id)).toHaveLength(1);

    const [createdDream] = await getUserDreams(user.id);
    const transactions = await getDreamTransactions(createdDream!.id);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.transactionType).toBe(CREDIT_TRANSACTION_TYPE.USED_WEEKLY);
  });
});
