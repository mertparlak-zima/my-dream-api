import { and, eq } from 'drizzle-orm';
import { DREAM_PROCESSING_CONFIG, PLAN_LIMITS } from '../../src/config';
import { DREAM_STATUS, LEDGER_REASON, PLAN, QUOTA_KEY, QUOTA_SOURCE } from '../../src/constants/domain';
import { CreditError } from '../../src/errors/CreditError';
import { ForbiddenError } from '../../src/errors/ForbiddenError';
import { NotFoundError } from '../../src/errors/NotFoundError';
import { ValidationError } from '../../src/errors/ValidationError';
import { db } from '../../src/db';
import { DEFAULT_SEED_OPENROUTER_MODEL_ID } from '../../src/db/seed.policy';
import { creditTransactions, dreams, userUsage, userWallets } from '../../src/db/schema';
import { processDream, recoverStuckDreams } from '../../src/features/dreams/dreams.processor';
import { dreamsService } from '../../src/features/dreams/dreams.service';
import { getWeekStartUtc } from '../../src/features/credits/quota-window';
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

const FREE_LIMIT = PLAN_LIMITS[PLAN.FREE];

function dreamInput(content: string, interpreterId: string) {
  return { content, interpreter_id: interpreterId, client_request_id: crypto.randomUUID() };
}

/** Effective weekly usage + wallet balance in the new decomposed model. */
async function getQuotaAndWallet(userId: string) {
  const weekStart = getWeekStartUtc(new Date());
  const [usage] = await testDb
    .select({ usedCount: userUsage.usedCount, windowStartedAt: userUsage.windowStartedAt })
    .from(userUsage)
    .where(and(eq(userUsage.userId, userId), eq(userUsage.quotaKey, QUOTA_KEY.weekly_free_dream)))
    .limit(1);
  const [wallet] = await testDb
    .select({ balance: userWallets.balance })
    .from(userWallets)
    .where(eq(userWallets.userId, userId))
    .limit(1);

  return {
    weeklyDreamCount:
      usage && usage.windowStartedAt.getTime() >= weekStart.getTime() ? usage.usedCount : 0,
    extraCredits: wallet?.balance ?? 0,
  };
}

async function getDreamLedgerReasons(dreamId: string): Promise<string[]> {
  const rows = await testDb.query.creditTransactions.findMany({
    where: eq(creditTransactions.relatedDreamId, dreamId),
    orderBy: (fields, { asc }) => [asc(fields.createdAt)],
  });
  return rows.map((row) => row.reason);
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
      columns: { status: true, interpretation: true },
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

  it('consumes the weekly free quota and creates a dream without a ledger row', async () => {
    const user = await createUserFixture({ plan: PLAN.FREE, extraCredits: 3 });
    const interpreter = await createInterpreterFixture();

    const response = await dreamsService.createDream(
      user.id,
      dreamInput('vitest: dream content for weekly quota', interpreter.id),
    );

    expect(response.status).toBe(DREAM_STATUS.PENDING);

    const [storedDream] = await getUserDreams(user.id);
    expect(storedDream?.id).toBe(response.id);
    expect(storedDream?.quotaSource).toBe(QUOTA_SOURCE.weekly_free);

    const credits = await getQuotaAndWallet(user.id);
    expect(credits.weeklyDreamCount).toBe(1);
    expect(credits.extraCredits).toBe(3);

    // Quota spends do not write to the immutable coin ledger.
    expect(await getDreamLedgerReasons(response.id)).toEqual([]);
  });

  it('falls back to the wallet once the quota is exhausted and writes a dream_charge', async () => {
    const user = await createUserFixture({ plan: PLAN.FREE, weeklyDreamCount: FREE_LIMIT, extraCredits: 2 });
    const interpreter = await createInterpreterFixture();

    const response = await dreamsService.createDream(
      user.id,
      dreamInput('vitest: dream content using a wallet coin', interpreter.id),
    );

    const [storedDream] = await getUserDreams(user.id);
    expect(storedDream?.quotaSource).toBe(QUOTA_SOURCE.wallet);

    const credits = await getQuotaAndWallet(user.id);
    expect(credits.weeklyDreamCount).toBe(FREE_LIMIT);
    expect(credits.extraCredits).toBe(1);

    expect(await getDreamLedgerReasons(response.id)).toEqual([LEDGER_REASON.dream_charge]);
  });

  it('throws CreditError when neither quota nor wallet can pay and leaves no dream', async () => {
    const user = await createUserFixture({ plan: PLAN.FREE, weeklyDreamCount: FREE_LIMIT, extraCredits: 0 });
    const interpreter = await createInterpreterFixture();

    await expect(
      dreamsService.createDream(user.id, dreamInput('vitest: no remaining credits', interpreter.id)),
    ).rejects.toBeInstanceOf(CreditError);

    const credits = await getQuotaAndWallet(user.id);
    expect(credits.weeklyDreamCount).toBe(FREE_LIMIT);
    expect(credits.extraCredits).toBe(0);
    expect(await getUserDreams(user.id)).toHaveLength(0);
    expect(await getUserTransactions(user.id)).toHaveLength(0);
  });

  it('rejects premium interpreters for FREE users and keeps credits unchanged', async () => {
    const user = await createUserFixture({ plan: PLAN.FREE, extraCredits: 2 });
    const interpreter = await createInterpreterFixture({ isPremium: true });

    await expect(
      dreamsService.createDream(user.id, dreamInput('vitest: premium forbidden', interpreter.id)),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const credits = await getQuotaAndWallet(user.id);
    expect(credits.weeklyDreamCount).toBe(0);
    expect(credits.extraCredits).toBe(2);
    expect(await getUserDreams(user.id)).toHaveLength(0);
  });

  it('rejects invalid or inactive interpreters and keeps credits unchanged', async () => {
    const user = await createUserFixture({ plan: PLAN.PRO, extraCredits: 2 });
    const inactiveInterpreter = await createInterpreterFixture({ isActive: false });

    await expect(
      dreamsService.createDream(user.id, dreamInput('vitest: inactive interpreter', inactiveInterpreter.id)),
    ).rejects.toBeInstanceOf(NotFoundError);

    await expect(
      dreamsService.createDream(user.id, dreamInput('vitest: invalid interpreter', crypto.randomUUID())),
    ).rejects.toBeInstanceOf(NotFoundError);

    const credits = await getQuotaAndWallet(user.id);
    expect(credits).toEqual({ weeklyDreamCount: 0, extraCredits: 2 });
    expect(await getUserDreams(user.id)).toHaveLength(0);
  });

  it('rejects dream creation when the user does not exist', async () => {
    const interpreter = await createInterpreterFixture();

    await expect(
      dreamsService.createDream(crypto.randomUUID(), dreamInput('vitest: missing user', interpreter.id)),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('rolls a previous-week quota window over before spending and consumes fresh quota', async () => {
    const user = await createUserFixture({ plan: PLAN.FREE, extraCredits: 0 });
    const interpreter = await createInterpreterFixture();
    const weekStart = getWeekStartUtc(new Date());

    // Seed a fully-used quota row from last week; it must roll over to a fresh slot.
    await testDb.insert(userUsage).values({
      userId: user.id,
      quotaKey: QUOTA_KEY.weekly_free_dream,
      windowStartedAt: new Date(weekStart.getTime() - 7 * 24 * 60 * 60 * 1000),
      usedCount: FREE_LIMIT,
    });

    const response = await dreamsService.createDream(
      user.id,
      dreamInput('vitest: expired window should roll over', interpreter.id),
    );

    expect(response.status).toBe(DREAM_STATUS.PENDING);
    expect((await getQuotaAndWallet(user.id)).weeklyDreamCount).toBe(1);
    expect(await getDreamLedgerReasons(response.id)).toEqual([]);
  });

  it('replays the original dream for a repeated client_request_id with the same payload', async () => {
    const user = await createUserFixture({ plan: PLAN.FREE, extraCredits: 0 });
    const interpreter = await createInterpreterFixture();
    const input = dreamInput('vitest: idempotent submission', interpreter.id);

    const first = await dreamsService.createDream(user.id, input);
    const replay = await dreamsService.createDream(user.id, input);

    expect(replay.id).toBe(first.id);
    // Only one dream and a single quota unit consumed despite two calls.
    expect(await getUserDreams(user.id)).toHaveLength(1);
    expect((await getQuotaAndWallet(user.id)).weeklyDreamCount).toBe(1);
  });

  it('rejects a reused client_request_id carrying a different payload', async () => {
    const user = await createUserFixture({ plan: PLAN.FREE, extraCredits: 5 });
    const interpreter = await createInterpreterFixture();
    const clientRequestId = crypto.randomUUID();

    await dreamsService.createDream(user.id, {
      content: 'vitest: original idempotent payload',
      interpreter_id: interpreter.id,
      client_request_id: clientRequestId,
    });

    await expect(
      dreamsService.createDream(user.id, {
        content: 'vitest: DIFFERENT payload for the same key',
        interpreter_id: interpreter.id,
        client_request_id: clientRequestId,
      }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
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
      interpreter: { id: interpreter.id, name: 'vitest: detail interpreter' },
    });

    await expect(dreamsService.getDreamById(otherUser.id, dream.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(dreamsService.getDreamById(user.id, crypto.randomUUID())).rejects.toBeInstanceOf(NotFoundError);
  });

  it('deletes a dream for the owning user, nulls related transactions, and rejects foreign or missing dreams', async () => {
    const user = await createUserFixture({ plan: PLAN.FREE, weeklyDreamCount: FREE_LIMIT, extraCredits: 1 });
    const otherUser = await createUserFixture();
    const interpreter = await createInterpreterFixture();

    // Wallet-paid dream so a ledger row exists to be nulled on delete.
    const response = await dreamsService.createDream(
      user.id,
      dreamInput('vitest: dream to be deleted', interpreter.id),
    );

    await expect(dreamsService.deleteDream(otherUser.id, response.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await getUserDreams(user.id)).toHaveLength(1);

    await expect(dreamsService.deleteDream(user.id, response.id)).resolves.toBeUndefined();
    expect(await getUserDreams(user.id)).toHaveLength(0);

    // The charge ledger row survives with a nulled related dream (onDelete: set null).
    const transactions = await getUserTransactions(user.id);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.relatedDreamId).toBeNull();

    await expect(dreamsService.deleteDream(user.id, response.id)).rejects.toBeInstanceOf(NotFoundError);
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
      dreamsService.submitFeedback(user.id, dream.id, { rating: 4, feedback_text: 'still pending' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('stores completed dream feedback and returns the serialized response', async () => {
    const user = await createUserFixture();
    const interpreter = await createInterpreterFixture({ name: 'vitest: interpreter completed', sortOrder: 7 });
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
    expect(response.rating).toBe(9);
    expect(response.feedback).toBe('vitest: very accurate');

    const storedDream = await testDb.query.dreams.findFirst({
      where: eq(dreams.id, dream.id),
      columns: { userRating: true, userFeedbackText: true },
    });
    expect(storedDream).toEqual({ userRating: 9, userFeedbackText: 'vitest: very accurate' });
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

    const response = await dreamsService.submitFeedback(user.id, dream.id, { rating: 7 });

    expect(response.feedback).toBeNull();
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
      dreamsService.submitFeedback(user.id, dream.id, { rating: 6 }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('completes delayed provider processing and sanitizes long interpretations', async () => {
    const user = await createUserFixture({ plan: PLAN.PRO, extraCredits: 1 });
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
      model: { openrouterModelId: DEFAULT_SEED_OPENROUTER_MODEL_ID },
    });
    expect(storedDream.interpretation).not.toContain('\u0000');
    expect(storedDream.interpretation?.length).toBeLessThanOrEqual(
      DREAM_PROCESSING_CONFIG.MAX_INTERPRETATION_LENGTH,
    );
  }, 10000);

  it('stores provider interpretation without generating production mock text', async () => {
    const user = await createUserFixture();
    const interpreter = await createInterpreterFixture({ name: 'vitest: short interpreter' });
    const interpretation = 'vitest: provider generated interpretation';
    const dream = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: 'vitest: short symbolic river dream',
      status: DREAM_STATUS.PENDING,
    });

    await processDreamWithProvider(dream.id, createTestDreamProvider({ interpretation }));

    const storedDream = await waitForDreamStatus(dream.id, DREAM_STATUS.COMPLETED, 1000);
    expect(storedDream.interpretation).toBe(interpretation);
  });

  it('marks empty provider output as FAILED and restores the weekly quota (no ledger)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = await createUserFixture({ plan: PLAN.FREE, extraCredits: 0 });
    const interpreter = await createInterpreterFixture();

    const response = await dreamsService.createDream(
      user.id,
      dreamInput('vitest: provider returns empty output', interpreter.id),
    );

    await processDreamWithProvider(response.id, createTestDreamProvider({ interpretation: ' \u0000 ' }));

    const storedDream = await testDb.query.dreams.findFirst({
      where: eq(dreams.id, response.id),
      columns: { status: true, interpretation: true, refundedAt: true },
    });
    expect(storedDream?.status).toBe(DREAM_STATUS.FAILED);
    expect(storedDream?.interpretation).toBeNull();
    expect(storedDream?.refundedAt).not.toBeNull();

    // Quota refunds restore the usage count and write no ledger row.
    expect((await getQuotaAndWallet(user.id)).weeklyDreamCount).toBe(0);
    expect(await getDreamLedgerReasons(response.id)).toEqual([]);
  });

  it('refunds a wallet-paid dream once and stays idempotent across re-processing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = await createUserFixture({ plan: PLAN.FREE, weeklyDreamCount: FREE_LIMIT, extraCredits: 1 });
    const interpreter = await createInterpreterFixture();

    const response = await dreamsService.createDream(
      user.id,
      dreamInput('vitest: wallet dream that fails and refunds', interpreter.id),
    );
    expect((await getQuotaAndWallet(user.id)).extraCredits).toBe(0);

    await failDreamImmediately(response.id);
    await processDreamImmediately(response.id); // re-processing must not double-refund

    expect((await getQuotaAndWallet(user.id)).extraCredits).toBe(1);
    expect(await getDreamLedgerReasons(response.id)).toEqual([
      LEDGER_REASON.dream_charge,
      LEDGER_REASON.dream_processing_refund,
    ]);
  });

  it('restores the correct source for quota and wallet refunds', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const interpreter = await createInterpreterFixture();
    const quotaUser = await createUserFixture({ plan: PLAN.FREE, extraCredits: 0 });
    const walletUser = await createUserFixture({ plan: PLAN.FREE, weeklyDreamCount: FREE_LIMIT, extraCredits: 2 });

    const quotaDream = await dreamsService.createDream(
      quotaUser.id,
      dreamInput('vitest: quota refund source', interpreter.id),
    );
    const walletDream = await dreamsService.createDream(
      walletUser.id,
      dreamInput('vitest: wallet refund source', interpreter.id),
    );

    await failDreamImmediately(quotaDream.id);
    await failDreamImmediately(walletDream.id);

    expect(await getQuotaAndWallet(quotaUser.id)).toEqual({ weeklyDreamCount: 0, extraCredits: 0 });
    expect(await getQuotaAndWallet(walletUser.id)).toEqual({ weeklyDreamCount: FREE_LIMIT, extraCredits: 2 });
  });

  it('marks a never-charged dream FAILED without any refund', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = await createUserFixture({ plan: PLAN.FREE, extraCredits: 2 });
    const interpreter = await createInterpreterFixture();
    const dream = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: 'vitest: fixture dream without a charge',
      status: DREAM_STATUS.PENDING,
    });

    await failDreamImmediately(dream.id);

    const storedDream = await testDb.query.dreams.findFirst({
      where: eq(dreams.id, dream.id),
      columns: { status: true },
    });
    expect(storedDream?.status).toBe(DREAM_STATUS.FAILED);
    expect(await getDreamLedgerReasons(dream.id)).toEqual([]);
    expect(await getQuotaAndWallet(user.id)).toEqual({ weeklyDreamCount: 0, extraCredits: 2 });
  });

  it('captures provider AppError status while failing and refunding a dream', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = await createUserFixture({ plan: PLAN.FREE, extraCredits: 0 });
    const interpreter = await createInterpreterFixture();
    const response = await dreamsService.createDream(
      user.id,
      dreamInput('vitest: provider app error should refund', interpreter.id),
    );

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
    expect((await getQuotaAndWallet(user.id)).weeklyDreamCount).toBe(0);
  });

  it('normalizes non-Error provider failures while failing and refunding a dream', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = await createUserFixture({ plan: PLAN.FREE, extraCredits: 0 });
    const interpreter = await createInterpreterFixture();
    const response = await dreamsService.createDream(
      user.id,
      dreamInput('vitest: provider plain failure should refund', interpreter.id),
    );

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
    expect((await getQuotaAndWallet(user.id)).weeklyDreamCount).toBe(0);
  });

  it('returns early when processing cannot claim a dream and never overwrites a finished one', async () => {
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
      columns: { status: true, interpretation: true },
    });
    expect(unchangedDream).toEqual({ status: DREAM_STATUS.COMPLETED, interpretation: 'vitest: complete' });
  });

  it('logs background worker errors when scheduled processing rejects', async () => {
    vi.useFakeTimers();

    const logErrorSpy = vi.spyOn(logger, 'error');
    vi.spyOn(db, 'execute').mockImplementationOnce(() => {
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
    vi.spyOn(db, 'execute').mockImplementationOnce(() => {
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

  it('prevents concurrent submissions from overspending the weekly quota', async () => {
    const user = await createUserFixture({ plan: PLAN.FREE, extraCredits: 0 });
    const interpreter = await createInterpreterFixture();

    const results = await Promise.allSettled([
      dreamsService.createDream(user.id, dreamInput('vitest: concurrent dream one', interpreter.id)),
      dreamsService.createDream(user.id, dreamInput('vitest: concurrent dream two', interpreter.id)),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    if (rejected[0]?.status === 'rejected') {
      expect(rejected[0].reason).toBeInstanceOf(CreditError);
    }

    expect((await getQuotaAndWallet(user.id)).weeklyDreamCount).toBe(FREE_LIMIT);
    expect(await getUserDreams(user.id)).toHaveLength(1);
  });

  it('looks a dream up by its client_request_id for the owning user only', async () => {
    const user = await createUserFixture({ plan: PLAN.FREE, extraCredits: 0 });
    const otherUser = await createUserFixture();
    const interpreter = await createInterpreterFixture();
    const clientRequestId = crypto.randomUUID();

    const created = await dreamsService.createDream(user.id, {
      content: 'vitest: lookup by client request id',
      interpreter_id: interpreter.id,
      client_request_id: clientRequestId,
    });

    const found = await dreamsService.getDreamByClientRequestId(user.id, clientRequestId);
    expect(found.id).toBe(created.id);

    await expect(
      dreamsService.getDreamByClientRequestId(otherUser.id, clientRequestId),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      dreamsService.getDreamByClientRequestId(user.id, crypto.randomUUID()),
    ).rejects.toBeInstanceOf(NotFoundError);
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
      .set({ status: DREAM_STATUS.PROCESSING, updatedAt: new Date() })
      .where(eq(dreams.id, dream.id));

    await expect(
      dreamsService.submitFeedback(user.id, dream.id, { rating: 5, feedback_text: 'too late' }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ValidationError when a completed dream feedback update returns no row', async () => {
    const user = await createUserFixture();
    const interpreter = await createInterpreterFixture();
    const dream = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: 'vitest: completed dream feedback returns no row',
      interpretation: 'vitest: interpretation text',
      status: DREAM_STATUS.COMPLETED,
    });

    vi.spyOn(db, 'update').mockImplementationOnce(() => ({
      set: () => ({ from: () => ({ where: () => ({ returning: async () => [] }) }) }),
    }) as never);

    await expect(
      dreamsService.submitFeedback(user.id, dream.id, { rating: 6 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('terminalizes a dream that has exhausted its attempts and refunds it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = await createUserFixture({ plan: PLAN.FREE, extraCredits: 1 });
    const interpreter = await createInterpreterFixture();

    // A wallet-charged dream that has already used all its processing attempts.
    const response = await dreamsService.createDream(
      user.id,
      { content: 'vitest: max attempts', interpreter_id: interpreter.id, client_request_id: crypto.randomUUID() },
    );
    await testDb
      .update(dreams)
      .set({ status: DREAM_STATUS.PENDING, attemptCount: DREAM_PROCESSING_CONFIG.MAX_ATTEMPTS, processingLeaseExpiresAt: null })
      .where(eq(dreams.id, response.id));

    await processDreamImmediately(response.id);

    const stored = await testDb.query.dreams.findFirst({
      where: eq(dreams.id, response.id),
      columns: { status: true, lastError: true, refundedAt: true },
    });
    expect(stored?.status).toBe(DREAM_STATUS.FAILED);
    expect(stored?.lastError).toBe('MAX_ATTEMPTS_EXCEEDED');
    expect(stored?.refundedAt).not.toBeNull();
    // Wallet coin restored.
    expect((await getQuotaAndWallet(user.id)).extraCredits).toBe(1);
  });

  it('finishes the refund for a FAILED dream that was left unrefunded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = await createUserFixture({ plan: PLAN.FREE, weeklyDreamCount: FREE_LIMIT, extraCredits: 1 });
    const interpreter = await createInterpreterFixture();

    const response = await dreamsService.createDream(
      user.id,
      { content: 'vitest: failed unrefunded', interpreter_id: interpreter.id, client_request_id: crypto.randomUUID() },
    );
    // Force a FAILED-but-unrefunded state (e.g. a crash between FAILED and refund).
    await testDb
      .update(dreams)
      .set({ status: DREAM_STATUS.FAILED, failedAt: new Date(), refundedAt: null, processingLeaseExpiresAt: null })
      .where(eq(dreams.id, response.id));
    expect((await getQuotaAndWallet(user.id)).extraCredits).toBe(0);

    await processDreamImmediately(response.id);

    expect((await getQuotaAndWallet(user.id)).extraCredits).toBe(1);
    expect(await getDreamLedgerReasons(response.id)).toEqual([
      LEDGER_REASON.dream_charge,
      LEDGER_REASON.dream_processing_refund,
    ]);
  });

  it('does not complete a dream that leaves PROCESSING mid-flight', async () => {
    const user = await createUserFixture();
    const interpreter = await createInterpreterFixture();
    const pendingDream = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: 'vitest: pending dream that leaves processing',
      status: DREAM_STATUS.PENDING,
    });

    // Claim runs, then the processor sleeps before its guarded select; flipping the
    // status during that window makes the attempt-guarded select return nothing.
    const processingPromise = processDreamWithDelay(pendingDream.id, 50);
    await waitForDreamStatus(pendingDream.id, DREAM_STATUS.PROCESSING, 1000);
    await testDb
      .update(dreams)
      .set({ status: DREAM_STATUS.FAILED, failedAt: new Date(), updatedAt: new Date() })
      .where(eq(dreams.id, pendingDream.id));
    await processingPromise;

    const stored = await testDb.query.dreams.findFirst({
      where: eq(dreams.id, pendingDream.id),
      columns: { status: true, interpretation: true },
    });
    expect(stored).toEqual({ status: DREAM_STATUS.FAILED, interpretation: null });
  });

  it('terminalizes a stale PROCESSING dream past its attempt limit', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = await createUserFixture();
    const interpreter = await createInterpreterFixture();
    const dream = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: 'vitest: stale processing past attempts',
      status: DREAM_STATUS.PENDING,
    });

    await testDb
      .update(dreams)
      .set({
        status: DREAM_STATUS.PROCESSING,
        attemptCount: DREAM_PROCESSING_CONFIG.MAX_ATTEMPTS,
        processingLeaseExpiresAt: new Date(Date.now() - 60_000),
      })
      .where(eq(dreams.id, dream.id));

    await processDreamImmediately(dream.id);

    const stored = await testDb.query.dreams.findFirst({
      where: eq(dreams.id, dream.id),
      columns: { status: true, lastError: true },
    });
    expect(stored?.status).toBe(DREAM_STATUS.FAILED);
    expect(stored?.lastError).toBe('MAX_ATTEMPTS_EXCEEDED');
  });

  it('recoverStuckDreams re-drives pending dreams and settles unrefunded failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const user = await createUserFixture({ plan: PLAN.FREE, weeklyDreamCount: FREE_LIMIT, extraCredits: 1 });
    const interpreter = await createInterpreterFixture();

    // A stuck PENDING dream (no charge) the sweeper should drive to COMPLETED.
    const pending = await createDreamFixture({
      userId: user.id,
      interpreterId: interpreter.id,
      content: 'vitest: stuck pending dream',
      status: DREAM_STATUS.PENDING,
    });

    // A wallet-charged dream left FAILED + unrefunded the sweeper should refund.
    const charged = await dreamsService.createDream(
      user.id,
      { content: 'vitest: sweeper refund', interpreter_id: interpreter.id, client_request_id: crypto.randomUUID() },
    );
    await testDb
      .update(dreams)
      .set({ status: DREAM_STATUS.FAILED, failedAt: new Date(), refundedAt: null })
      .where(eq(dreams.id, charged.id));

    await recoverStuckDreams();

    const pendingStored = await waitForDreamStatus(pending.id, DREAM_STATUS.COMPLETED, 1000);
    expect(pendingStored.status).toBe(DREAM_STATUS.COMPLETED);

    const chargedStored = await testDb.query.dreams.findFirst({
      where: eq(dreams.id, charged.id),
      columns: { refundedAt: true },
    });
    expect(chargedStored?.refundedAt).not.toBeNull();
    expect((await getQuotaAndWallet(user.id)).extraCredits).toBe(1);
  });
});
