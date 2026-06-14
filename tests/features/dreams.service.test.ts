import { eq } from 'drizzle-orm';
import { DREAM_PROCESSING_CONFIG, PLAN_LIMITS } from '../../src/config';
import { CREDIT_TRANSACTION_TYPE, DREAM_STATUS, PLAN } from '../../src/constants/domain';
import { CreditError } from '../../src/errors/CreditError';
import { ForbiddenError } from '../../src/errors/ForbiddenError';
import { NotFoundError } from '../../src/errors/NotFoundError';
import { ValidationError } from '../../src/errors/ValidationError';
import { db } from '../../src/db';
import { DEFAULT_SEED_OPENROUTER_MODEL_ID } from '../../src/db/seed.policy';
import { creditTransactions, dreams, users } from '../../src/db/schema';
import { processDream } from '../../src/features/dreams/dreams.processor';
import { dreamsService } from '../../src/features/dreams/dreams.service';
import { getNextWeeklyResetDate } from '../../src/utils/date';
import { logger } from '../../src/utils/logger';
import {
  createDreamFixture,
  createInterpreterFixture,
  createSmokeInterpreterFixture,
  createUserFixture,
  resetFixtures,
} from '../helpers/fixtures';
import { testDb } from '../helpers/db';
import {
  createTestDreamProvider,
  failDreamImmediately,
  processDreamImmediately,
  processDreamWithProvider,
  processDreamWithDelay,
  scheduleDreamProcessing,
} from '../helpers/dreamsProcessing';

async function getUserCredits(userId: string) {
  const user = await testDb.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      weeklyDreamCount: true,
      extraCredits: true,
      limitResetDate: true,
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

  it('resets expired weekly credits before spend decisions and uses weekly credit', async () => {
    const now = new Date();

    const user = await createUserFixture({
      plan: PLAN.FREE,
      weeklyDreamCount: PLAN_LIMITS[PLAN.FREE],
      extraCredits: 0,
      limitResetDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    });
    const interpreter = await createInterpreterFixture();

    const response = await dreamsService.createDream(user.id, {
      content: 'vitest: expired reset should spend weekly credit',
      interpreter_id: interpreter.id,
    });

    expect(response.status).toBe(DREAM_STATUS.PENDING);

    const updatedUser = await getUserCredits(user.id);
    expect(updatedUser.weeklyDreamCount).toBe(1);
    expect(updatedUser.extraCredits).toBe(0);
    expect(updatedUser.limitResetDate.toISOString()).toBe(getNextWeeklyResetDate(now).toISOString());

    const transactions = await getDreamTransactions(response.id);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.transactionType).toBe(CREDIT_TRANSACTION_TYPE.USED_WEEKLY);
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
        accentColor: '#234E83',
      },
    });

    await expect(dreamsService.getDreamById(otherUser.id, dream.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(dreamsService.getDreamById(user.id, crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deletes a dream for the owning user, nulls related transactions, and rejects foreign or missing dreams', async () => {
    const user = await createUserFixture();
    const otherUser = await createUserFixture();
    const interpreter = await createInterpreterFixture();

    const response = await dreamsService.createDream(user.id, {
      content: 'vitest: dream to be deleted',
      interpreter_id: interpreter.id,
    });

    // A foreign user cannot delete it and the dream survives.
    await expect(dreamsService.deleteDream(otherUser.id, response.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await getUserDreams(user.id)).toHaveLength(1);

    await expect(dreamsService.deleteDream(user.id, response.id)).resolves.toBeUndefined();
    expect(await getUserDreams(user.id)).toHaveLength(0);

    // The spend transaction survives with a nulled related dream (onDelete: set null).
    const transactions = await getUserTransactions(user.id);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.relatedDreamId).toBeNull();

    // A second delete (now missing) reports not found.
    await expect(dreamsService.deleteDream(user.id, response.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lists only the current user dreams in reverse chronological order', async () => {
    const user = await createUserFixture();
    const otherUser = await createUserFixture();
    const interpreter = await createInterpreterFixture({
      name: 'vitest: list interpreter',
      description: 'vitest: list description',
      sortOrder: 4,
    });
    const userDreams: Array<{ id: string; content: string }> = [];
    const baseDate = new Date('2024-01-01T00:00:00.000Z');

    for (let index = 0; index < 25; index += 1) {
      const dream = await createDreamFixture({
        userId: user.id,
        interpreterId: interpreter.id,
        content: `vitest:user-dream-${index + 1}`,
        status: index % 2 === 0 ? DREAM_STATUS.PENDING : DREAM_STATUS.COMPLETED,
        interpretation: index % 2 === 0 ? null : `vitest:interpretation-${index + 1}`,
      });
      userDreams.push({
        id: dream.id,
        content: `vitest:user-dream-${index + 1}`,
      });

      const timestamp = new Date(baseDate.getTime() + index * 60_000);
      await testDb
        .update(dreams)
        .set({
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .where(eq(dreams.id, dream.id));
    }

    await createDreamFixture({
      userId: otherUser.id,
      interpreterId: interpreter.id,
      content: 'vitest: other user dream',
      status: DREAM_STATUS.COMPLETED,
    });

    const selectArgs: Array<Record<string, unknown>> = [];
    const originalSelect = db.select.bind(db);
    const selectSpy = vi.spyOn(db, 'select').mockImplementation(((fields?: unknown) => {
      selectArgs.push((fields ?? {}) as Record<string, unknown>);
      return originalSelect(fields as never) as never;
    }) as never);

    try {
      const firstPage = await dreamsService.listDreams(user.id, { limit: 20 });

      expect(Object.keys(selectArgs[0] ?? {})).toEqual(['id', 'content', 'status', 'isBookmarked', 'createdAt']);
      expect(firstPage.items).toHaveLength(20);
      expect(firstPage.nextCursor).toEqual(expect.any(String));
      expect(firstPage.items[0]).toEqual(
        expect.objectContaining({
          id: userDreams[24]!.id,
          content: 'vitest:user-dream-25',
          status: DREAM_STATUS.PENDING,
          createdAt: expect.any(String),
        }),
      );
      expect(firstPage.items[0]).not.toHaveProperty('interpretation');
      expect(firstPage.items[0]).not.toHaveProperty('interpreter');
      expect(firstPage.items[0]).not.toHaveProperty('rating');
      expect(firstPage.items[0]).not.toHaveProperty('feedback');
      expect(firstPage.items[0]).not.toHaveProperty('updatedAt');

      const secondPage = await dreamsService.listDreams(user.id, {
        limit: 20,
        cursor: firstPage.nextCursor!,
      });

      expect(selectArgs).toHaveLength(2);
      expect(Object.keys(selectArgs[1] ?? {})).toEqual(['id', 'content', 'status', 'isBookmarked', 'createdAt']);
      expect(secondPage.items).toHaveLength(5);
      expect(secondPage.nextCursor).toBeNull();
      expect(secondPage.items.map((dream) => dream.id)).toEqual([
        userDreams[4]!.id,
        userDreams[3]!.id,
        userDreams[2]!.id,
        userDreams[1]!.id,
        userDreams[0]!.id,
      ]);
      expect(secondPage.items.every((dream) => dream.content.startsWith('vitest:user-dream-'))).toBe(true);
      expect(secondPage.items.every((dream) => Object.keys(dream).sort().join(',') === 'content,createdAt,id,isBookmarked,status')).toBe(true);
    } finally {
      selectSpy.mockRestore();
    }
  });

  it('rejects malformed dream list cursors', async () => {
    const user = await createUserFixture();
    const missingFieldCursor = Buffer.from(JSON.stringify({
      createdAt: '2026-01-01T00:00:00.000Z',
    }), 'utf8').toString('base64url');
    const invalidDateCursor = Buffer.from(JSON.stringify({
      createdAt: 'not-a-date',
      id: crypto.randomUUID(),
    }), 'utf8').toString('base64url');

    await expect(
      dreamsService.listDreams(user.id, { limit: 10, cursor: 'not-base64-json' }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      dreamsService.listDreams(user.id, { limit: 10, cursor: missingFieldCursor }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      dreamsService.listDreams(user.id, { limit: 10, cursor: invalidDateCursor }),
    ).rejects.toBeInstanceOf(ValidationError);
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

  it('forbids feedback when a completed dream changes away from COMPLETED before submission', async () => {
    const user = await createUserFixture();
    const interpreter = await createInterpreterFixture();
    const dream = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: 'vitest: completed dream becomes processing',
      interpretation: 'vitest: interpretation text',
      status: DREAM_STATUS.COMPLETED,
    });

    await testDb
      .update(dreams)
      .set({
        status: DREAM_STATUS.PROCESSING,
        updatedAt: new Date(),
      })
      .where(eq(dreams.id, dream.id));

    await expect(
      dreamsService.submitFeedback(user.id, dream.id, {
        rating: 5,
        feedback_text: 'too late',
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
      accentColor: '#234E83',
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

  it('returns not found when feedback targets another user dream', async () => {
    const user = await createUserFixture();
    const otherUser = await createUserFixture();
    const interpreter = await createInterpreterFixture();
    const dream = await createDreamFixture({
      userId: otherUser.id,
      interpreterId: interpreter.id,
      content: 'vitest: completed dream for another user',
      interpretation: 'vitest: interpretation text',
      status: DREAM_STATUS.COMPLETED,
    });

    await expect(
      dreamsService.submitFeedback(user.id, dream.id, {
        rating: 6,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
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
        from: () => ({
          where: () => ({
            returning: async () => [],
          }),
        }),
      }),
    }) as never);

    await expect(
      dreamsService.submitFeedback(user.id, dream.id, {
        rating: 6,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('completes delayed provider processing and sanitizes long interpretations', async () => {
    const user = await createUserFixture({ plan: PLAN.PRO, weeklyDreamCount: 0, extraCredits: 1 });
    const interpreter = await createSmokeInterpreterFixture({
      name: 'vitest: provider interpreter',
      systemPrompt: 'vitest: provider system prompt',
    });
    const longContent = `  ${'moonlight '.repeat(30)}${'echo '.repeat(20)}  `;
    const requests: unknown[] = [];
    const provider = createTestDreamProvider({
      interpretation: `\u0000line one\r\n\r\n\r\n${'x'.repeat(DREAM_PROCESSING_CONFIG.MAX_INTERPRETATION_LENGTH + 10)}`,
      onRequest: (request) => requests.push(request),
    });

    const dream = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: longContent,
      status: DREAM_STATUS.PENDING,
    });

    const processingPromise = processDreamWithProvider(dream.id, provider, 25);
    await waitForDreamStatus(dream.id, DREAM_STATUS.PROCESSING, 1000);
    await processingPromise;

    const storedDream = await waitForDreamStatus(dream.id, DREAM_STATUS.COMPLETED, 1000);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      dreamId: dream.id,
      userId: user.id,
      content: longContent,
      interpreter: {
        id: interpreter.id,
        name: 'vitest: provider interpreter',
        systemPrompt: 'vitest: provider system prompt',
      },
      model: {
        openrouterModelId: DEFAULT_SEED_OPENROUTER_MODEL_ID,
      },
    });
    expect(storedDream.interpretation).not.toContain('\u0000');
    expect(storedDream.interpretation).not.toContain('\r\n');
    expect(storedDream.interpretation).not.toContain('\n\n\n');
    expect(storedDream.interpretation?.length).toBeLessThanOrEqual(
      DREAM_PROCESSING_CONFIG.MAX_INTERPRETATION_LENGTH,
    );
  }, 10000);

  it('stores provider interpretation without generating production mock text', async () => {
    const user = await createUserFixture();
    const interpreter = await createInterpreterFixture({
      name: 'vitest: short interpreter',
    });
    const interpretation = 'vitest: provider generated interpretation';
    const dream = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: 'vitest: short symbolic river dream',
      status: DREAM_STATUS.PENDING,
    });

    await processDreamWithProvider(
      dream.id,
      createTestDreamProvider({ interpretation }),
    );

    const storedDream = await waitForDreamStatus(dream.id, DREAM_STATUS.COMPLETED, 1000);

    expect(storedDream.interpretation).toBe(interpretation);
  });

  it('marks sanitized empty provider output as FAILED and refunds spent credit', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = await createUserFixture({ plan: PLAN.FREE, weeklyDreamCount: 0, extraCredits: 0 });
    const interpreter = await createInterpreterFixture();

    const response = await dreamsService.createDream(user.id, {
      content: 'vitest: provider returns empty output',
      interpreter_id: interpreter.id,
    });

    await processDreamWithProvider(
      response.id,
      createTestDreamProvider({ interpretation: ' \u0000 ' }),
    );

    const storedDream = await testDb.query.dreams.findFirst({
      where: eq(dreams.id, response.id),
      columns: { status: true, interpretation: true },
    });
    expect(storedDream).toEqual({
      status: DREAM_STATUS.FAILED,
      interpretation: null,
    });

    const updatedUser = await getUserCredits(user.id);
    expect(updatedUser.weeklyDreamCount).toBe(0);
    expect(updatedUser.extraCredits).toBe(0);

    const transactions = await getDreamTransactions(response.id);
    expect(transactions.map((transaction) => transaction.transactionType)).toEqual([
      CREDIT_TRANSACTION_TYPE.USED_WEEKLY,
      CREDIT_TRANSACTION_TYPE.REFUNDED,
    ]);
  });

  it('retries a failed refund when the refund transaction fails once', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = await createUserFixture({ plan: PLAN.FREE, weeklyDreamCount: 0, extraCredits: 0 });
    const interpreter = await createInterpreterFixture();

    const response = await dreamsService.createDream(user.id, {
      content: 'vitest: provider should fail and refund this dream',
      interpreter_id: interpreter.id,
    });

    vi.spyOn(db, 'transaction').mockImplementationOnce(async () => {
      throw new Error('vitest: refund transaction failed');
    });

    await expect(
      processDreamWithProvider(
        response.id,
        createTestDreamProvider({ fail: true }),
      ),
    ).rejects.toThrow('vitest: refund transaction failed');

    const failedDream = await testDb.query.dreams.findFirst({
      where: eq(dreams.id, response.id),
      columns: { status: true },
    });
    expect(failedDream?.status).toBe(DREAM_STATUS.FAILED);

    const creditsAfterFailure = await getUserCredits(user.id);
    expect(creditsAfterFailure.weeklyDreamCount).toBe(1);
    expect(creditsAfterFailure.extraCredits).toBe(0);
    expect(await getDreamTransactions(response.id)).toHaveLength(1);

    await processDreamImmediately(response.id);

    const creditsAfterRetry = await getUserCredits(user.id);
    expect(creditsAfterRetry.weeklyDreamCount).toBe(0);
    expect(creditsAfterRetry.extraCredits).toBe(0);

    const transactions = await getDreamTransactions(response.id);
    expect(transactions.map((transaction) => transaction.transactionType)).toEqual([
      CREDIT_TRANSACTION_TYPE.USED_WEEKLY,
      CREDIT_TRANSACTION_TYPE.REFUNDED,
    ]);
  });

  it('keeps a single REFUNDED transaction when retrying a failed dream after refund success', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = await createUserFixture({ plan: PLAN.FREE, weeklyDreamCount: 0, extraCredits: 0 });
    const interpreter = await createInterpreterFixture();

    const response = await dreamsService.createDream(user.id, {
      content: 'vitest: provider should fail and refund this dream',
      interpreter_id: interpreter.id,
    });

    await failDreamImmediately(response.id);
    await processDreamImmediately(response.id);

    const transactions = await getDreamTransactions(response.id);
    expect(transactions.map((transaction) => transaction.transactionType)).toEqual([
      CREDIT_TRANSACTION_TYPE.USED_WEEKLY,
      CREDIT_TRANSACTION_TYPE.REFUNDED,
    ]);

    const updatedUser = await getUserCredits(user.id);
    expect(updatedUser.weeklyDreamCount).toBe(0);
    expect(updatedUser.extraCredits).toBe(0);
  });

  it('refunds restore the correct credit source for weekly and extra spends', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const interpreter = await createInterpreterFixture();
    const weeklyUser = await createUserFixture({ plan: PLAN.FREE, weeklyDreamCount: 0, extraCredits: 0 });
    const extraUser = await createUserFixture({
      plan: PLAN.FREE,
      weeklyDreamCount: PLAN_LIMITS[PLAN.FREE],
      extraCredits: 2,
    });

    const weeklyDream = await dreamsService.createDream(weeklyUser.id, {
      content: 'vitest: weekly refund source check',
      interpreter_id: interpreter.id,
    });
    const extraDream = await dreamsService.createDream(extraUser.id, {
      content: 'vitest: extra refund source check',
      interpreter_id: interpreter.id,
    });

    await failDreamImmediately(weeklyDream.id);
    await failDreamImmediately(extraDream.id);

    const weeklyCredits = await getUserCredits(weeklyUser.id);
    expect(weeklyCredits.weeklyDreamCount).toBe(0);
    expect(weeklyCredits.extraCredits).toBe(0);

    const extraCredits = await getUserCredits(extraUser.id);
    expect(extraCredits.weeklyDreamCount).toBe(PLAN_LIMITS[PLAN.FREE]);
    expect(extraCredits.extraCredits).toBe(2);
  });

  it('marks provider failures as FAILED without refund when no spend transaction exists', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = await createUserFixture({ plan: PLAN.FREE, weeklyDreamCount: 0, extraCredits: 2 });
    const interpreter = await createInterpreterFixture();
    const dream = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: 'vitest: fixture dream without spend transaction',
      status: DREAM_STATUS.PENDING,
    });

    await failDreamImmediately(dream.id);

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

  it('captures provider AppError status while failing and refunding a dream', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = await createUserFixture({ plan: PLAN.FREE, weeklyDreamCount: 0, extraCredits: 0 });
    const interpreter = await createInterpreterFixture();
    const response = await dreamsService.createDream(user.id, {
      content: 'vitest: provider app error should refund',
      interpreter_id: interpreter.id,
    });

    await processDreamWithProvider(response.id, {
      async interpret() {
        throw new ValidationError('vitest: provider validation failure');
      },
    });

    const storedDream = await testDb.query.dreams.findFirst({
      where: eq(dreams.id, response.id),
      columns: { status: true },
    });
    expect(storedDream?.status).toBe(DREAM_STATUS.FAILED);
    expect((await getDreamTransactions(response.id)).map((transaction) => transaction.transactionType)).toEqual([
      CREDIT_TRANSACTION_TYPE.USED_WEEKLY,
      CREDIT_TRANSACTION_TYPE.REFUNDED,
    ]);
  });

  it('normalizes non-Error provider failures while failing and refunding a dream', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = await createUserFixture({ plan: PLAN.FREE, weeklyDreamCount: 0, extraCredits: 0 });
    const interpreter = await createInterpreterFixture();
    const response = await dreamsService.createDream(user.id, {
      content: 'vitest: provider plain failure should refund',
      interpreter_id: interpreter.id,
    });

    await processDreamWithProvider(response.id, {
      async interpret() {
        return Promise.reject('vitest: provider plain failure');
      },
    });

    const storedDream = await testDb.query.dreams.findFirst({
      where: eq(dreams.id, response.id),
      columns: { status: true },
    });
    expect(storedDream?.status).toBe(DREAM_STATUS.FAILED);
    expect((await getDreamTransactions(response.id)).map((transaction) => transaction.transactionType)).toEqual([
      CREDIT_TRANSACTION_TYPE.USED_WEEKLY,
      CREDIT_TRANSACTION_TYPE.REFUNDED,
    ]);
  });

  it('returns early when processing cannot claim a pending dream or the dream leaves PROCESSING before completion', async () => {
    await expect(processDream(crypto.randomUUID())).resolves.toBeUndefined();
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

  it('logs background worker errors when scheduled processing rejects', async () => {
    vi.useFakeTimers();

    const logErrorSpy = vi.spyOn(logger, 'error');
    vi.spyOn(db, 'update').mockImplementationOnce(() => {
      throw new Error('vitest: scheduled processing failed');
    });

    scheduleDreamProcessing(crypto.randomUUID());
    await vi.advanceTimersByTimeAsync(300);

    expect(logErrorSpy).toHaveBeenCalledWith(
      'dream worker failed',
      expect.objectContaining({
        op: 'dream.worker',
        err: expect.objectContaining({ message: 'vitest: scheduled processing failed' }),
      }),
    );
  });

  it('normalizes non-Error scheduled processing rejections', async () => {
    vi.useFakeTimers();

    const logErrorSpy = vi.spyOn(logger, 'error');
    vi.spyOn(db, 'update').mockImplementationOnce(() => {
      throw new String('vitest: scheduled plain failure');
    });

    scheduleDreamProcessing(crypto.randomUUID());
    await vi.advanceTimersByTimeAsync(300);

    expect(logErrorSpy).toHaveBeenCalledWith(
      'dream worker failed',
      expect.objectContaining({
        op: 'dream.worker',
        err: expect.objectContaining({ name: 'NonError', message: 'vitest: scheduled plain failure' }),
      }),
    );
  });

  it('prevents concurrent submissions from overspending weekly credits', async () => {
    const now = new Date();

    const user = await createUserFixture({
      plan: PLAN.FREE,
      weeklyDreamCount: PLAN_LIMITS[PLAN.FREE],
      extraCredits: 0,
      limitResetDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
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
    expect(updatedUser.limitResetDate.toISOString()).toBe(getNextWeeklyResetDate(now).toISOString());
    expect(await getUserDreams(user.id)).toHaveLength(1);

    const [createdDream] = await getUserDreams(user.id);
    const transactions = await getDreamTransactions(createdDream!.id);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.transactionType).toBe(CREDIT_TRANSACTION_TYPE.USED_WEEKLY);
  });
});
