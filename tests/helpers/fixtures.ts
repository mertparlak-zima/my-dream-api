import { createHash } from 'node:crypto';

import { eq } from 'drizzle-orm';
import {
  AUTH_PROVIDER,
  DREAM_STATUS,
  LEDGER_REASON,
  PLAN,
  QUOTA_KEY,
  type LedgerReason,
} from '../../src/constants/domain';
import { DEFAULT_SEED_OPENROUTER_MODEL_ID } from '../../src/db/seed.policy';
import {
  accounts,
  aiModels,
  creditTransactions,
  dreams,
  interpreters,
  userEntitlements,
  userUsage,
  userWallets,
  users,
} from '../../src/db/schema';
import { getWeekStartUtc } from '../../src/features/credits/quota-window';
import { cleanupTestData, ensureUserExists, markCreated, testDb } from './db';

const TEST_EMAIL_PREFIX = 'vitest+';
const TEST_TEXT_PREFIX = 'vitest:';
const TEST_MODEL_PREFIX = 'vitest/';
const SMOKE_MODEL_NAME = `Smoke OpenRouter ${DEFAULT_SEED_OPENROUTER_MODEL_ID}`;

type UserFixtureInput = {
  id?: string;
  email?: string;
  authProvider?: (typeof AUTH_PROVIDER)[keyof typeof AUTH_PROVIDER] | null;
  providerId?: string;
  firstName?: string | null;
  lastName?: string | null;
  plan?: (typeof PLAN)[keyof typeof PLAN];
  weeklyDreamCount?: number;
  extraCredits?: number;
};

type ModelFixtureInput = {
  id?: string;
  name?: string;
  openrouterModelId?: string;
  requiredPlan?: (typeof PLAN)[keyof typeof PLAN];
  isActive?: boolean;
  contextLength?: number | null;
  pricePrompt?: string | null;
  priceCompletion?: string | null;
};

type InterpreterFixtureInput = {
  id?: string;
  modelId?: string;
  name?: string;
  description?: string;
  systemPrompt?: string;
  imageUrl?: string | null;
  isPremium?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  tag?: string;
  accentColor?: string;
};

type DreamFixtureInput = {
  userId: string;
  interpreterId: string;
  content?: string;
  interpretation?: string | null;
  status?: (typeof DREAM_STATUS)[keyof typeof DREAM_STATUS];
  userRating?: number | null;
  userFeedbackText?: string | null;
  isBookmarked?: boolean;
  clientRequestId?: string;
  completedAt?: Date | null;
  failedAt?: Date | null;
};

type CreditFixtureInput = {
  userId: string;
  amount?: number;
  balanceAfter?: number;
  reason?: LedgerReason;
  relatedDreamId?: string | null;
  idempotencyKey?: string | null;
};

function testToken(): string {
  return crypto.randomUUID();
}

function testRequestHash(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

const PROVIDER_ID_BY_AUTH: Record<(typeof AUTH_PROVIDER)[keyof typeof AUTH_PROVIDER], string> = {
  [AUTH_PROVIDER.GOOGLE]: 'google',
  [AUTH_PROVIDER.APPLE]: 'apple',
};

export function authDevHeaders(userId: string): Record<string, string> {
  return { 'X-Dev-User-Id': userId };
}

export async function createUserFixture(input: UserFixtureInput = {}) {
  const now = new Date();
  const id = input.id ?? crypto.randomUUID();
  const firstName = input.firstName ?? 'Vitest';
  const lastName = input.lastName ?? 'User';

  await testDb.insert(users).values({
    id,
    name: `${firstName} ${lastName}`.trim() || 'Vitest User',
    email: input.email ?? `${TEST_EMAIL_PREFIX}${testToken()}@mydream.local`,
    emailVerified: true,
    firstName,
    lastName,
    updatedAt: now,
  });

  // A linked social account drives the displayed provider identity. `null`
  // models an email/password (no social) user.
  const authProvider = input.authProvider === undefined ? AUTH_PROVIDER.GOOGLE : input.authProvider;
  if (authProvider) {
    await testDb.insert(accounts).values({
      userId: id,
      providerId: PROVIDER_ID_BY_AUTH[authProvider],
      accountId: input.providerId ?? `${TEST_TEXT_PREFIX}${testToken()}`,
      updatedAt: now,
    });
  }

  await testDb.insert(userEntitlements).values({ userId: id, plan: input.plan ?? PLAN.FREE });
  await testDb.insert(userWallets).values({ userId: id, balance: input.extraCredits ?? 0 });

  if (input.weeklyDreamCount && input.weeklyDreamCount > 0) {
    await testDb.insert(userUsage).values({
      userId: id,
      quotaKey: QUOTA_KEY.weekly_free_dream,
      windowStartedAt: getWeekStartUtc(now),
      usedCount: input.weeklyDreamCount,
    });
  }

  markCreated('user', id);

  return { id, headers: authDevHeaders(id) };
}

/**
 * Inserts a minimal Better Auth user with NO name and NO domain rows, modelling a
 * user that Better Auth has just created but whose profile/domain state has not
 * been provisioned yet (used to exercise the profile-bootstrap first-fill path).
 */
export async function seedBareUser(): Promise<string> {
  const now = new Date();
  const id = crypto.randomUUID();
  await testDb.insert(users).values({
    id,
    name: 'Bare User',
    email: `${TEST_EMAIL_PREFIX}${testToken()}@mydream.local`,
    emailVerified: true,
    updatedAt: now,
  });
  markCreated('user', id);
  return id;
}

export async function createModelFixture(input: ModelFixtureInput = {}) {
  const now = new Date();
  const id = input.id ?? crypto.randomUUID();

  await testDb.insert(aiModels).values({
    id,
    name: input.name ?? `${TEST_TEXT_PREFIX}model:${testToken()}`,
    openrouterModelId: input.openrouterModelId ?? `${TEST_MODEL_PREFIX}${testToken()}`,
    requiredPlan: input.requiredPlan ?? PLAN.FREE,
    isActive: input.isActive ?? true,
    contextLength: input.contextLength ?? 4096,
    pricePrompt: input.pricePrompt ?? '0',
    priceCompletion: input.priceCompletion ?? '0',
    updatedAt: now,
  });

  markCreated('model', id);

  return { id };
}

export async function createSmokeModelFixture(input: Omit<ModelFixtureInput, 'openrouterModelId'> = {}) {
  const [existingModel] = await testDb
    .select({ id: aiModels.id })
    .from(aiModels)
    .where(eq(aiModels.openrouterModelId, DEFAULT_SEED_OPENROUTER_MODEL_ID))
    .limit(1);

  if (existingModel) {
    return { id: existingModel.id };
  }

  return createModelFixture({
    ...input,
    openrouterModelId: DEFAULT_SEED_OPENROUTER_MODEL_ID,
    name: input.name ?? SMOKE_MODEL_NAME,
  });
}

export async function createInterpreterFixture(input: InterpreterFixtureInput = {}) {
  const now = new Date();
  const modelId = input.modelId ?? (await createModelFixture()).id;
  const id = input.id ?? crypto.randomUUID();

  await testDb.insert(interpreters).values({
    id,
    modelId,
    name: input.name ?? `${TEST_TEXT_PREFIX}interpreter:${testToken()}`,
    description: input.description ?? `${TEST_TEXT_PREFIX}interpreter description`,
    systemPrompt: input.systemPrompt ?? `${TEST_TEXT_PREFIX}system prompt`,
    imageUrl: input.imageUrl ?? null,
    isPremium: input.isPremium ?? false,
    isActive: input.isActive ?? true,
    sortOrder: input.sortOrder ?? 0,
    tag: input.tag ?? `${TEST_TEXT_PREFIX}tag`,
    accentColor: input.accentColor ?? '#234E83',
    updatedAt: now,
  });

  markCreated('interpreter', id);

  return { id, modelId };
}

export async function createSmokeInterpreterFixture(
  input: Omit<InterpreterFixtureInput, 'modelId'> = {},
) {
  const model = await createSmokeModelFixture();

  return createInterpreterFixture({
    ...input,
    modelId: model.id,
  });
}

export async function createDreamFixture(input: DreamFixtureInput) {
  const now = new Date();
  const id = crypto.randomUUID();
  const status = input.status ?? DREAM_STATUS.PENDING;

  await testDb.insert(dreams).values({
    id,
    userId: input.userId,
    interpreterId: input.interpreterId,
    content: input.content ?? `${TEST_TEXT_PREFIX}dream content`,
    interpretation: input.interpretation ?? null,
    status,
    userRating: input.userRating ?? null,
    userFeedbackText: input.userFeedbackText ?? null,
    isBookmarked: input.isBookmarked ?? false,
    clientRequestId: input.clientRequestId ?? crypto.randomUUID(),
    requestHash: testRequestHash(id),
    queuedAt: now,
    completedAt: input.completedAt ?? (status === DREAM_STATUS.COMPLETED ? now : null),
    failedAt: input.failedAt ?? (status === DREAM_STATUS.FAILED ? now : null),
    updatedAt: now,
  });

  markCreated('dream', id);

  return { id };
}

export async function createCreditFixture(input: CreditFixtureInput) {
  const id = crypto.randomUUID();
  const amount = input.amount ?? 1;

  await testDb.insert(creditTransactions).values({
    id,
    userId: input.userId,
    amount,
    balanceAfter: input.balanceAfter ?? Math.max(amount, 0),
    reason: input.reason ?? LEDGER_REASON.purchase,
    relatedDreamId: input.relatedDreamId ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
  });

  markCreated('credit', id);

  return { id };
}

export async function createAuthedUserFixture(input: UserFixtureInput = {}) {
  const user = await createUserFixture(input);
  return {
    ...user,
    authHeaders: authDevHeaders(user.id),
  };
}

export async function resetFixtures(): Promise<void> {
  await cleanupTestData();
}

export async function ensureAuthedUserFixture(userId: string) {
  const exists = await ensureUserExists(userId);

  if (!exists) {
    await createUserFixture({ id: userId });
  }

  return authDevHeaders(userId);
}
