import { db, queryClient } from '.';
import { AUTH_PROVIDER, PLAN } from '../constants/domain';
import { aiModels } from '../features/ai_models/models.schema';
import { interpreters } from '../features/interpreters/interpreters.schema';
import { users } from '../features/users/users.schema';
import { getNextWeeklyResetDate } from '../utils/date';
import { parseSeedPolicy, type SeedPolicy } from './seed.policy';

const DEV_USER_ID = '00000000-0000-4000-8000-000000000001';
const DEFAULT_MODEL_ID = '10000000-0000-4000-8000-000000000001';
type SeedDatabase = Pick<typeof db, 'insert'>;

const seedInterpreters = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    name: 'Psikolog Selin',
    description: 'Modern psikoloji perspektifiyle sakin ve analitik rüya yorumu yapar.',
    systemPrompt: 'Sen modern psikoloji perspektifiyle rüya yorumlayan sakin ve analitik bir uzmansın.',
    imageUrl: null,
    isPremium: false,
    sortOrder: 10,
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    name: 'Dervis Ali',
    description: 'Sembollere ve kadim anlatılara odaklanan mistik bir yorum sunar.',
    systemPrompt: 'Sen sembollere ve kadim anlatılara odaklanan mistik bir rüya yorumcususun.',
    imageUrl: null,
    isPremium: false,
    sortOrder: 20,
  },
  {
    id: '20000000-0000-4000-8000-000000000003',
    name: 'Astrolog Mira',
    description: 'Gezegenler, döngüler ve sezgisel semboller üzerinden yorum yapar.',
    systemPrompt: 'Sen astrolojik semboller ve sezgisel döngüler üzerinden rüya yorumlayan bir uzmansın.',
    imageUrl: null,
    isPremium: true,
    sortOrder: 30,
  },
] as const;

async function seedModel(seedDb: SeedDatabase, policy: SeedPolicy, now: Date): Promise<void> {
  await seedDb
    .insert(aiModels)
    .values({
      id: DEFAULT_MODEL_ID,
      name: policy.modelName,
      openrouterModelId: policy.openrouterModelId,
      requiredPlan: PLAN.FREE,
      isActive: true,
      contextLength: 8000,
      pricePrompt: '0',
      priceCompletion: '0',
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: aiModels.id,
      set: {
        name: policy.modelName,
        openrouterModelId: policy.openrouterModelId,
        requiredPlan: PLAN.FREE,
        isActive: true,
        contextLength: 8000,
        pricePrompt: '0',
        priceCompletion: '0',
        updatedAt: now,
      },
    });
}

async function seedInterpreterRows(seedDb: SeedDatabase, now: Date): Promise<void> {
  for (const interpreter of seedInterpreters) {
    await seedDb
      .insert(interpreters)
      .values({
        ...interpreter,
        modelId: DEFAULT_MODEL_ID,
        isActive: true,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: interpreters.id,
        set: {
          name: interpreter.name,
          description: interpreter.description,
          systemPrompt: interpreter.systemPrompt,
          imageUrl: interpreter.imageUrl,
          isPremium: interpreter.isPremium,
          modelId: DEFAULT_MODEL_ID,
          isActive: true,
          sortOrder: interpreter.sortOrder,
          updatedAt: now,
        },
      });
  }
}

async function seedDevUser(seedDb: SeedDatabase, now: Date): Promise<void> {
  await seedDb
    .insert(users)
    .values({
      id: DEV_USER_ID,
      email: 'dev@mydream.local',
      authProvider: AUTH_PROVIDER.GOOGLE,
      providerId: 'dev-provider',
      firstName: 'Dev',
      lastName: 'User',
      plan: PLAN.FREE,
      weeklyDreamCount: 0,
      limitResetDate: getNextWeeklyResetDate(now),
      extraCredits: 5,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: 'dev@mydream.local',
        authProvider: AUTH_PROVIDER.GOOGLE,
        providerId: 'dev-provider',
        firstName: 'Dev',
        lastName: 'User',
        plan: PLAN.FREE,
        weeklyDreamCount: 0,
        limitResetDate: getNextWeeklyResetDate(now),
        extraCredits: 5,
        updatedAt: now,
      },
    });
}

async function seed(policy: SeedPolicy): Promise<void> {
  const now = new Date();

  await db.transaction(async (tx) => {
    await seedModel(tx, policy, now);
    await seedInterpreterRows(tx, now);

    await seedDevUser(tx, now);
  });

  console.info(`Seed completed. Mode: ${policy.mode}. Model: ${policy.openrouterModelId}.`);
  console.info(`Local dev user id: ${DEV_USER_ID}`);
}

try {
  await seed(parseSeedPolicy());
} finally {
  await queryClient.end();
}
