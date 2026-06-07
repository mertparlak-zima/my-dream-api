import { db, queryClient } from '.';
import { AUTH_PROVIDER, PLAN } from '../constants/domain';
import { aiModels } from '../features/ai_models/models.schema';
import { dictionaryEntries } from '../features/dictionary/dictionary.schema';
import { interpreters } from '../features/interpreters/interpreters.schema';
import { appUpdates } from '../features/updates/updates.schema';
import { users } from '../features/users/users.schema';
import { getNextWeeklyResetDate } from '../utils/date';
import {
  DEFAULT_MODEL_ID,
  REFERENCE_INTERPRETERS,
  REFERENCE_MODEL,
  REFERENCE_UPDATES,
  buildDictionaryRows,
} from './reference-data';
import { parseSeedPolicy, type SeedPolicy } from './seed.policy';

const DEV_USER_ID = '00000000-0000-4000-8000-000000000001';
type SeedDatabase = Pick<typeof db, 'insert'>;

async function seedModel(seedDb: SeedDatabase, now: Date): Promise<void> {
  const values = { ...REFERENCE_MODEL, isActive: true, updatedAt: now };
  await seedDb
    .insert(aiModels)
    .values(values)
    .onConflictDoUpdate({ target: aiModels.id, set: values });
}

async function seedInterpreterRows(seedDb: SeedDatabase, now: Date): Promise<void> {
  for (const interpreter of REFERENCE_INTERPRETERS) {
    const values = {
      ...interpreter,
      styles: [...interpreter.styles],
      samples: [...interpreter.samples],
      modelId: DEFAULT_MODEL_ID,
      isActive: true,
      updatedAt: now,
    };
    await seedDb
      .insert(interpreters)
      .values(values)
      .onConflictDoUpdate({ target: interpreters.id, set: values });
  }
}

async function seedDictionaryRows(seedDb: SeedDatabase, now: Date): Promise<void> {
  for (const row of buildDictionaryRows()) {
    const values = { ...row, updatedAt: now };
    await seedDb
      .insert(dictionaryEntries)
      .values(values)
      .onConflictDoUpdate({ target: dictionaryEntries.slug, set: values });
  }
}

async function seedUpdateRows(seedDb: SeedDatabase, now: Date): Promise<void> {
  for (const update of REFERENCE_UPDATES) {
    const values = { ...update, bodyTr: [...update.bodyTr], updatedAt: now };
    await seedDb
      .insert(appUpdates)
      .values(values)
      .onConflictDoUpdate({ target: appUpdates.slug, set: values });
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
    await seedModel(tx, now);
    await seedInterpreterRows(tx, now);
    await seedDictionaryRows(tx, now);
    await seedUpdateRows(tx, now);

    await seedDevUser(tx, now);
  });

  console.info(`Seed completed. Mode: ${policy.mode}. Reference data + dev user upserted (local).`);
  console.info(`Local dev user id: ${DEV_USER_ID}`);
}

try {
  await seed(parseSeedPolicy());
} finally {
  await queryClient.end();
}
