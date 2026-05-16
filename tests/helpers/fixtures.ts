import { AUTH_PROVIDER, CREDIT_TRANSACTION_TYPE, DREAM_STATUS, PLAN } from '../../src/constants/domain';
import { getNextWeeklyResetDate } from '../../src/utils/date';
import { aiModels, creditTransactions, dreams, interpreters, users } from '../../src/db/schema';
import { cleanupTestData, ensureUserExists, markCreated, testDb } from './db';

const TEST_EMAIL_PREFIX = 'vitest+';
const TEST_TEXT_PREFIX = 'vitest:';
const TEST_MODEL_PREFIX = 'vitest/';

type UserFixtureInput = {
  id?: string;
  email?: string;
  authProvider?: (typeof AUTH_PROVIDER)[keyof typeof AUTH_PROVIDER];
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
};

type DreamFixtureInput = {
  userId: string;
  interpreterId: string;
  content?: string;
  interpretation?: string | null;
  status?: (typeof DREAM_STATUS)[keyof typeof DREAM_STATUS];
  userRating?: number | null;
  userFeedbackText?: string | null;
};

type CreditFixtureInput = {
  userId: string;
  amount?: number;
  transactionType?: (typeof CREDIT_TRANSACTION_TYPE)[keyof typeof CREDIT_TRANSACTION_TYPE];
  relatedDreamId?: string | null;
};

function testToken(): string {
  return crypto.randomUUID();
}

export function authDevHeaders(userId: string): Record<string, string> {
  return { 'X-Dev-User-Id': userId };
}

export async function createUserFixture(input: UserFixtureInput = {}) {
  const now = new Date();
  const id = input.id ?? crypto.randomUUID();

  await testDb.insert(users).values({
    id,
    email: input.email ?? `${TEST_EMAIL_PREFIX}${testToken()}@mydream.local`,
    authProvider: input.authProvider ?? AUTH_PROVIDER.GOOGLE,
    providerId: input.providerId ?? `${TEST_TEXT_PREFIX}${testToken()}`,
    firstName: input.firstName ?? 'Vitest',
    lastName: input.lastName ?? 'User',
    plan: input.plan ?? PLAN.FREE,
    weeklyDreamCount: input.weeklyDreamCount ?? 0,
    limitResetDate: getNextWeeklyResetDate(now),
    extraCredits: input.extraCredits ?? 0,
    updatedAt: now,
  });

  markCreated('user', id);

  return { id, headers: authDevHeaders(id) };
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
    updatedAt: now,
  });

  markCreated('interpreter', id);

  return { id, modelId };
}

export async function createDreamFixture(input: DreamFixtureInput) {
  const now = new Date();
  const id = crypto.randomUUID();

  await testDb.insert(dreams).values({
    id,
    userId: input.userId,
    interpreterId: input.interpreterId,
    content: input.content ?? `${TEST_TEXT_PREFIX}dream content`,
    interpretation: input.interpretation ?? null,
    status: input.status ?? DREAM_STATUS.PENDING,
    userRating: input.userRating ?? null,
    userFeedbackText: input.userFeedbackText ?? null,
    updatedAt: now,
  });

  markCreated('dream', id);

  return { id };
}

export async function createCreditFixture(input: CreditFixtureInput) {
  const id = crypto.randomUUID();

  await testDb.insert(creditTransactions).values({
    id,
    userId: input.userId,
    amount: input.amount ?? 1,
    transactionType: input.transactionType ?? CREDIT_TRANSACTION_TYPE.PURCHASED,
    relatedDreamId: input.relatedDreamId ?? null,
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
