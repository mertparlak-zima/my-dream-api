import { db, queryClient } from '.';
import { aiModels } from '../features/ai_models/models.schema';
import { dictionaryEntries } from '../features/dictionary/dictionary.schema';
import { interpreters } from '../features/interpreters/interpreters.schema';
import { appUpdates } from '../features/updates/updates.schema';
import { userPreferences } from '../features/users/user_preferences.schema';
import { users } from './schema/auth';
import { userEntitlements, userWallets } from './schema/domain';
import {
  DEFAULT_MODEL_ID,
  REFERENCE_INTERPRETERS,
  REFERENCE_MODEL,
  REFERENCE_UPDATES,
  buildDictionaryRows,
} from './reference-data';
import { parseSeedPolicy, type SeedPolicy } from './seed.policy';

const DEV_USER_ID = '00000000-0000-4000-8000-000000000001';
const DEV_USER_EMAIL = 'dev@mydream.local';
const DEV_WALLET_BALANCE = 5;
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

/**
 * Local-only dev user reachable via the X-Dev-User-Id bypass (no password/account
 * is needed for that flow, so a direct row insert is fine). Provisions the new
 * decomposed domain rows: a FREE entitlement, default preferences and a small
 * wallet balance to exercise the wallet spend path.
 */
async function seedDevUser(seedDb: SeedDatabase, now: Date): Promise<void> {
  const identity = {
    name: 'Dev User',
    email: DEV_USER_EMAIL,
    emailVerified: true,
    firstName: 'Dev',
    lastName: 'User',
    updatedAt: now,
  };
  await seedDb
    .insert(users)
    .values({ id: DEV_USER_ID, ...identity })
    .onConflictDoUpdate({ target: users.id, set: identity });

  await seedDb.insert(userEntitlements).values({ userId: DEV_USER_ID }).onConflictDoNothing();
  await seedDb.insert(userPreferences).values({ userId: DEV_USER_ID }).onConflictDoNothing();
  await seedDb
    .insert(userWallets)
    .values({ userId: DEV_USER_ID, balance: DEV_WALLET_BALANCE })
    .onConflictDoUpdate({ target: userWallets.userId, set: { balance: DEV_WALLET_BALANCE, updatedAt: now } });
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
