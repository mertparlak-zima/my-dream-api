# Better Auth + PostgreSQL Migration — Implementation Plan (root + API Phase A)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Supabase'i tamamen kaldırıp Better Auth (Hono içinde) + self-hosted PostgreSQL + Redis stack'ine geçmek; auth/domain/history/audit şemasını ve kredi/kota mantığını transaction-safe kurmak.

**Architecture:** Tek `public` Postgres schema; Better Auth çoğul tablolar (`users`/`accounts`/`sessions`/`verifications`, UUID PK) PostgreSQL'de source-of-truth; domain (`user_entitlements`/`user_usage`/`user_wallets`/`credit_transactions`), history (`entitlement_history`) ve `audit_logs` ayrı yaşam döngüleri. Better Auth CLI yalnız schema generate eder; migration sahibi Drizzle Kit.

**Tech Stack:** Bun, Hono, Better Auth, Drizzle ORM, PostgreSQL 16, Redis (ioredis), Vitest, zod 4.

**Kaynak spec:** [docs/specs/2026-06-21-better-auth-postgres-migration.md](../../specs/2026-06-21-better-auth-postgres-migration.md) — bu plan spec'in tek kaynağıdır; çelişkide spec kazanır.

## Global Constraints

- Tek `public` Postgres schema; ayrı `auth` schema YOK.
- Tüm domain/history/audit FK → `users.id` (UUID, `gen_random_uuid()`). snake_case kolon, `timestamptz`.
- Better Auth: `usePlural: true`, `advanced.database.generateId: 'uuid'`. CLI yalnız `generate` (pinli sürüm, `@latest` YOK); migration `drizzle-kit generate` + `drizzle-kit migrate`.
- No silent fallback: kritik bağımlılık (Postgres/Redis) ayakta değilse fail-loud (5xx); config env+zod-required.
- Coverage gate %100 korunur (`vitest.config.ts` `coverage.include[]` curated liste; yeni gated modül → tam test).
- Commit yalnız kullanıcı isteyince; bu workspace'te `gh` mutating işlemleri ayrı onayla.
- FK on-delete: `accounts`/`sessions`/`user_preferences`/`user_profiles`/`user_entitlements`/`user_usage`/`user_wallets`/`dreams` → CASCADE; `credit_transactions`/`entitlement_history`/`audit_logs` → SET NULL (nullable user_id); `dreams.charged_/refund_transaction_id` → RESTRICT.

---

## Faz / Plan Decomposition (milestone/issue haritası)

Spec iki subsystem + API içinde 4 faz içerir. Her faz kendi başına çalışır/test edilebilir; her biri ayrı plan dokümanı + ayrı issue grubu olur.

| Plan | Kapsam | Milestone | Bağımlılık |
| :-- | :-- | :-- | :-- |
| **API Faz A** (bu dokümanda) | Şema temeli: deps, Better Auth config iskeleti, auth schema generate, domain/history/audit schema + enums + constraints + circular-FK migration | API-1 | — |
| **API Faz B** | Better Auth runtime: handler mount, `authMiddleware` → `getSession`, env/config zod, Supabase JWT removal, dev email/password, rate-limit mount + contract testleri | API-1 | A |
| **API Faz C** | Domain servis refactor: `ensureUserDomainState`, entitlement/usage/wallet, kredi ledger, dream-create idempotency (`ON CONFLICT`) + atomik kota/kredi, recovery + `transitionToFailedAndRefund` + sweeper | API-1 | A, B |
| **API Faz D** | Audit + entitlement_history yazımı, Supabase env/kod/doküman temizliği, coverage gate, live verification | API-1 | C |
| **APP-1** | Expo: native auth spike gate, supabase-js removal, Better Auth Expo client (cookie transport), Apple/Google idToken, store/refresh rewrite, profile bootstrap, foreground getSession, pending-mutation idempotency | APP-1 | API-1 deploy |

Faz B–D ve APP-1 planları, Faz A merge edildikten sonra ayrı dokümanlara yazılır (bkz. son bölüm "Sonraki planlar").

---

## API Faz A — Şema Temeli

**File Structure (bu fazda dokunulan/oluşturulan):**

- Create: `src/auth/auth.ts` — Better Auth config (CLI generate için yeterli iskelet; runtime mount Faz B).
- Create: `src/auth/apple-client-secret.ts` — `generateAppleClientSecret` helper (Faz B'de kullanılır; A'da imza + birim test).
- Create: `src/db/schema/auth.ts` — Better Auth CLI generate çıktısı (review-merge).
- Create: `src/db/schema/domain.ts` — `user_entitlements`/`user_usage`/`user_wallets`.
- Create: `src/db/schema/history.ts` — `entitlement_history`.
- Create: `src/db/schema/audit.ts` — `audit_logs`.
- Modify: `src/db/enums.ts` — yeni enum'lar (entitlement, quota, audit, dream status/quota_source, ledger reason).
- Modify: `src/constants/domain.ts` — yeni constant tuple'lar.
- Modify: `src/features/credits/credits.schema.ts` — `credit_transactions` yeni model (signed amount/balance_after/reason/idempotency/FK).
- Modify: `src/features/dreams/dreams.schema.ts` — idempotency/recovery/billing kolonları + constraint + partial index.
- Modify: `src/features/users/users.schema.ts` — **kaldırılır/yerini Better Auth `users` alır** (provider/plan/credit kolonları taşınır).
- Modify: `src/db/schema.ts` — barrel: yeni schema dosyalarını export et.
- Modify: `drizzle.config.ts` — `schema: './src/db/schema.ts'` korunur (barrel hepsini topluyor); gerekirse glob.
- Modify: `package.json` — `better-auth` dep + `auth:generate` script.

**Önemli sıra kuralı:** auth tabloları Better Auth CLI'dan üretilir → önce `auth.ts` config iskeleti olmalı. Domain/history/audit tabloları `users.id`'ye FK verir → auth schema üretildikten sonra yazılır. `dreams ↔ credit_transactions` circular FK migration'da üç adımda kurulur (dreams charged/refund FK'siz → credit_transactions → ALTER dreams).

---

### Task A1: Better Auth bağımlılığı + secret/url env

**Files:**
- Modify: `package.json`
- Modify: `src/config/env.ts` (zod schema)
- Modify: `src/config/index.ts` (export)
- Test: `tests/unit/config.env.test.ts` (mevcutsa genişlet; yoksa oluştur)

**Interfaces:**
- Produces: `env.BETTER_AUTH_SECRET: string` (≥32), `env.BETTER_AUTH_URL: string` — Faz B config + A2 CLI generate tüketir.

- [ ] **Step 1: Bağımlılığı ekle (pinli)**

```bash
cd React/my-dream/my-dream-api
bun add better-auth@1.3.7   # mevcut en güncel pinli sürüm; lockfile'a yazılır
```
(Sürümü kurulum anında `bun pm ls better-auth` ile teyit et ve plan/PR'da sabitle.)

- [ ] **Step 2: Failing test — env BETTER_AUTH_SECRET zorunlu**

`tests/unit/config.env.test.ts` içine ekle:
```ts
import { describe, expect, it } from 'vitest';
import { parseRuntimeEnv } from '../../src/config/env';

describe('better-auth env', () => {
  it('rejects BETTER_AUTH_SECRET shorter than 32 chars', () => {
    expect(() => parseRuntimeEnv({
      ...baseValidEnv, // mevcut helper; yoksa tüm required alanları doldur
      BETTER_AUTH_SECRET: 'too-short',
      BETTER_AUTH_URL: 'https://api.example.com',
    })).toThrow();
  });

  it('accepts a valid better-auth secret/url', () => {
    const parsed = parseRuntimeEnv({
      ...baseValidEnv,
      BETTER_AUTH_SECRET: 'x'.repeat(32),
      BETTER_AUTH_URL: 'https://api.example.com',
    });
    expect(parsed.BETTER_AUTH_URL).toBe('https://api.example.com');
  });
});
```

- [ ] **Step 3: Run test — fail**

Run: `bun run test tests/unit/config.env.test.ts`
Expected: FAIL (BETTER_AUTH_SECRET schema'da yok).

- [ ] **Step 4: env.ts'e zod alanlarını ekle**

`src/config/env.ts` zod object'ine:
```ts
BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 chars'),
BETTER_AUTH_URL: z.string().url(),
```
`src/config/index.ts`'e export ekle:
```ts
export const BETTER_AUTH_SECRET = runtimeEnv.BETTER_AUTH_SECRET;
export const BETTER_AUTH_URL = runtimeEnv.BETTER_AUTH_URL;
```

- [ ] **Step 5: Run test — pass**

Run: `bun run test tests/unit/config.env.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock src/config/env.ts src/config/index.ts tests/unit/config.env.test.ts
git commit -m "feat(api): add better-auth dep and BETTER_AUTH_SECRET/URL env"
```

---

### Task A2: Better Auth config iskeleti (CLI generate için)

**Files:**
- Create: `src/auth/auth.ts`
- Create: `src/auth/apple-client-secret.ts`
- Test: `tests/unit/apple-client-secret.test.ts`
- Modify: `package.json` (`auth:generate` script)

**Interfaces:**
- Produces: `export const auth` (betterAuth instance) — A3 CLI generate ve Faz B handler/middleware tüketir.
- Produces: `generateAppleClientSecret(serviceId, teamId, keyId, privateKeyPem): Promise<string>` — auth.ts apple provider tüketir.

- [ ] **Step 1: Failing test — apple client secret bir JWT üretir**

`tests/unit/apple-client-secret.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { generateAppleClientSecret } from '../../src/auth/apple-client-secret';

// Test fixture: ephemeral ES256 private key (PKCS8 PEM). Helper ile üret.
import { generateTestEs256Pem } from '../helpers/es256';

describe('generateAppleClientSecret', () => {
  it('produces a JWT with header alg ES256 and three segments', async () => {
    const pem = await generateTestEs256Pem();
    const jwt = await generateAppleClientSecret('svc.id', 'TEAMID', 'KEYID', pem);
    expect(jwt.split('.')).toHaveLength(3);
  });
});
```
`tests/helpers/es256.ts`:
```ts
import { exportPKCS8, generateKeyPair } from 'jose';
export async function generateTestEs256Pem(): Promise<string> {
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  return exportPKCS8(privateKey);
}
```

- [ ] **Step 2: Run test — fail**

Run: `bun run test tests/unit/apple-client-secret.test.ts`
Expected: FAIL (modül yok).

- [ ] **Step 3: apple-client-secret.ts implement et**

`src/auth/apple-client-secret.ts`:
```ts
import { importPKCS8, SignJWT } from 'jose';

const APPLE_AUD = 'https://appleid.apple.com';
const SIX_MONTHS_SECONDS = 60 * 60 * 24 * 180; // Apple secret max ~6 ay

export async function generateAppleClientSecret(
  serviceId: string, teamId: string, keyId: string, privateKeyPem: string,
): Promise<string> {
  const key = await importPKCS8(privateKeyPem, 'ES256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .setExpirationTime(now + SIX_MONTHS_SECONDS)
    .setAudience(APPLE_AUD)
    .setSubject(serviceId)
    .sign(key);
}
```

- [ ] **Step 4: Run test — pass**

Run: `bun run test tests/unit/apple-client-secret.test.ts`
Expected: PASS.

- [ ] **Step 5: auth.ts config iskeletini yaz**

`src/auth/auth.ts` (spec §4 ile birebir; runtime mount Faz B):
```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { expo } from '@better-auth/expo';
import { db } from '../db';
import * as schema from '../db/schema';
import {
  BETTER_AUTH_SECRET, BETTER_AUTH_URL, NODE_ENV,
  GOOGLE_WEB_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID, GOOGLE_WEB_CLIENT_SECRET,
  APPLE_SERVICE_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, APPLE_APP_BUNDLE_IDENTIFIER,
} from '../config';
import { generateAppleClientSecret } from './apple-client-secret';

const trustedOrigins = [
  'myapp://', 'https://appleid.apple.com',
  ...(NODE_ENV !== 'production' ? ['myapp-dev://', 'exp://**'] : []),
];

const hasGoogleConfig = Boolean(
  GOOGLE_WEB_CLIENT_ID && GOOGLE_IOS_CLIENT_ID && GOOGLE_ANDROID_CLIENT_ID && GOOGLE_WEB_CLIENT_SECRET,
);
const hasAppleConfig = Boolean(
  APPLE_SERVICE_ID && APPLE_TEAM_ID && APPLE_KEY_ID && APPLE_PRIVATE_KEY && APPLE_APP_BUNDLE_IDENTIFIER,
);

const socialProviders = {
  ...(hasGoogleConfig ? {
    google: {
      clientId: [GOOGLE_WEB_CLIENT_ID!, GOOGLE_IOS_CLIENT_ID!, GOOGLE_ANDROID_CLIENT_ID!],
      clientSecret: GOOGLE_WEB_CLIENT_SECRET!,
    },
  } : {}),
  ...(hasAppleConfig ? {
    apple: async () => ({
      clientId: APPLE_SERVICE_ID!,
      clientSecret: await generateAppleClientSecret(
        APPLE_SERVICE_ID!, APPLE_TEAM_ID!, APPLE_KEY_ID!, APPLE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
      ),
      appBundleIdentifier: APPLE_APP_BUNDLE_IDENTIFIER!,
    }),
  } : {}),
};

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', usePlural: true, schema }),
  baseURL: BETTER_AUTH_URL,
  secret: BETTER_AUTH_SECRET,
  advanced: { database: { generateId: 'uuid' } },
  socialProviders,
  account: {
    encryptOAuthTokens: true,
    accountLinking: { enabled: true, allowDifferentEmails: false, allowUnlinkingAll: false },
  },
  user: { additionalFields: {
    firstName: { type: 'string', required: false, input: false },
    lastName: { type: 'string', required: false, input: false },
  } },
  emailAndPassword: { enabled: NODE_ENV !== 'production' },
  rateLimit: { enabled: false },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24, freshAge: 60 * 10 },
  plugins: [expo()],
  trustedOrigins,
});
```
Bağımlılık: `bun add @better-auth/expo@<better-auth ile uyumlu sürüm>`. Config'in import ettiği yeni env'ler (GOOGLE_*, APPLE_*, NODE_ENV) Faz B'de zod-required eklenecek; A'da `src/config` bunları opsiyonel string olarak export etmeli (CLI generate'in çalışması için). Bu opsiyonel export'ları aynı commit'te ekle.

- [ ] **Step 6: auth:generate script**

`package.json` scripts:
```json
"auth:generate": "better-auth generate --config src/auth/auth.ts --output src/db/schema/auth.ts -y"
```

- [ ] **Step 7: check + test**

Run: `bunx tsc --noEmit && bun run test tests/unit/apple-client-secret.test.ts`
Expected: tsc temiz, test PASS.

- [ ] **Step 8: Commit**

```bash
git add src/auth package.json bun.lock src/config tests/unit/apple-client-secret.test.ts tests/helpers/es256.ts
git commit -m "feat(api): add better-auth config skeleton and apple client-secret helper"
```

---

### Task A3: Auth schema generate + barrel + ilk migration

**Files:**
- Create: `src/db/schema/auth.ts` (generate çıktısı, review-merge)
- Modify: `src/db/schema.ts` (barrel export)
- Modify: `src/features/users/users.schema.ts` (eski custom users tablosu kaldırılır)
- Test: `tests/db/auth-schema.test.ts`

**Interfaces:**
- Produces: `users`, `accounts`, `sessions`, `verifications` Drizzle tabloları (UUID PK) — tüm domain/history/audit FK ve Faz B/C tüketir.

- [ ] **Step 1: Generate**

Run: `bun run auth:generate`
Çıktı: `src/db/schema/auth.ts` (plural, UUID, `users`/`accounts`/`sessions`/`verifications` + `firstName`/`lastName` additionalFields).

- [ ] **Step 2: Çıktıyı review et + barrel'a bağla**

`src/db/schema.ts` barrel'da eski `users.schema` export'unu **kaldır**, `./schema/auth` ekle:
```ts
export * from './schema/auth';
// export * from '../features/users/users.schema';  // KALDIRILDI — Better Auth users sahibi
export * from '../features/users/user_profiles.schema';
export * from '../features/users/user_preferences.schema';
// ... diğerleri aynı
```
`src/features/users/users.schema.ts` dosyasını sil (provider/plan/credit kolonları domain tablolarına taşınacak — A4/A5). `user_profiles`/`user_preferences` FK referansını `auth` `users` tablosuna güncelle (Drizzle `references(() => users.id)`).

- [ ] **Step 3: Migration üret + uygula**

```bash
docker compose up -d
bun run db:generate
bun run db:migrate   # opaque hata olursa CLAUDE.md'deki ORM migrator script fallback'i
```

- [ ] **Step 4: Failing→passing test — tablolar var**

`tests/db/auth-schema.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../../src/db';

describe('auth schema', () => {
  it('creates users/accounts/sessions/verifications with uuid users.id', async () => {
    const rows = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public'
        AND table_name IN ('users','accounts','sessions','verifications')`);
    expect(rows.length).toBe(4);
    const idType = await db.execute(sql`
      SELECT data_type FROM information_schema.columns
      WHERE table_name='users' AND column_name='id'`);
    expect(idType[0]?.data_type).toBe('uuid');
  });
});
```

Run: `bun run test tests/db/auth-schema.test.ts` → PASS (DB ayakta).

- [ ] **Step 5: check + lint**

Run: `bunx tsc --noEmit && bun run lint`
Expected: temiz (kalan `users.schema` importları kırılırsa A4/A5/A6'ya kadar geçici; bu task'ta yalnız profiles/preferences FK'leri düzeltilir, dreams/credits A5/A6'da).

- [ ] **Step 6: Commit**

```bash
git add src/db/schema src/db/schema.ts src/features/users drizzle tests/db/auth-schema.test.ts
git commit -m "feat(api): generate better-auth auth schema, drop custom users table"
```

> NOT: A3 sonrası `dreams.schema`/`credits.schema` eski `users` importu nedeniyle tsc kırılabilir; A4–A6 bunları kapatır. Faz A merge'i bu task grubu (A1–A8) bir bütün olarak tsc/lint/test temiz olduğunda yapılır — ara commit'ler arası kırık olabilir, faz sonu yeşil olmalı.

---

### Task A4: Domain enums/constants + entitlement/usage/wallet schema

**Files:**
- Modify: `src/constants/domain.ts`
- Modify: `src/db/enums.ts`
- Create: `src/db/schema/domain.ts`
- Test: `tests/db/domain-schema.test.ts`

**Interfaces:**
- Produces: `userEntitlements`, `userUsage`, `userWallets` Drizzle tabloları + enum'lar (`ENTITLEMENT_STATUSES`, `BILLING_PROVIDERS`, `STORES`, `QUOTA_KEYS`) — Faz C servisleri tüketir.

- [ ] **Step 1: Constants ekle**

`src/constants/domain.ts`:
```ts
export const ENTITLEMENT_STATUSES = ['active', 'expired', 'canceled'] as const;
export type EntitlementStatus = typeof ENTITLEMENT_STATUSES[number];
export const BILLING_PROVIDERS = ['revenuecat', 'admin', 'free'] as const;
export type BillingProvider = typeof BILLING_PROVIDERS[number];
export const STORES = ['app_store', 'google_play'] as const;
export type Store = typeof STORES[number];
export const QUOTA_KEYS = ['weekly_free_dream', 'subscription_daily_dream'] as const;
export type QuotaKey = typeof QUOTA_KEYS[number];
```

- [ ] **Step 2: Enums ekle**

`src/db/enums.ts`:
```ts
export const entitlementStatusEnum = pgEnum('entitlement_status', ENTITLEMENT_STATUSES);
export const billingProviderEnum = pgEnum('billing_provider', BILLING_PROVIDERS);
export const storeEnum = pgEnum('store', STORES);
export const quotaKeyEnum = pgEnum('quota_key', QUOTA_KEYS);
```
(import'ları üstte ekle.)

- [ ] **Step 3: domain.ts schema yaz**

`src/db/schema/domain.ts`:
```ts
import { sql } from 'drizzle-orm';
import { check, integer, pgTable, smallint, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { billingProviderEnum, entitlementStatusEnum, planEnum, quotaKeyEnum, storeEnum } from '../enums';

export const userEntitlements = pgTable('user_entitlements', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  plan: planEnum('plan').notNull().default('FREE'),
  status: entitlementStatusEnum('status').notNull().default('active'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  billingProvider: billingProviderEnum('billing_provider').notNull().default('free'),
  store: storeEnum('store'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const userUsage = pgTable('user_usage', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  quotaKey: quotaKeyEnum('quota_key').notNull(),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
  usedCount: integer('used_count').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.userId, t.quotaKey] }),
  check('user_usage_used_count_nonneg', sql`${t.usedCount} >= 0`),
]);

export const userWallets = pgTable('user_wallets', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  balance: integer('balance').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [check('user_wallets_balance_nonneg', sql`${t.balance} >= 0`)]);
```
(`primaryKey` import'unu ekle.)

- [ ] **Step 4: barrel + migration + test**

`src/db/schema.ts`'e `export * from './schema/domain';` ekle.
```bash
bun run db:generate && bun run db:migrate
```
`tests/db/domain-schema.test.ts`: wallet balance negatif INSERT'i CHECK ile reddedilmeli:
```ts
import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../../src/db';

it('rejects negative wallet balance via CHECK', async () => {
  await expect(db.execute(sql`
    INSERT INTO user_wallets (user_id, balance)
    VALUES (gen_random_uuid(), -1)`)).rejects.toThrow();
});
```
(FK nedeniyle gerçek user gerekebilir; test geçici user INSERT eder veya CHECK'i FK'den önce tetiklemek için var olan seeded user kullanır.)

Run: `bun run test tests/db/domain-schema.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/constants/domain.ts src/db/enums.ts src/db/schema/domain.ts src/db/schema.ts drizzle tests/db/domain-schema.test.ts
git commit -m "feat(api): add entitlement/usage/wallet schema with check constraints"
```

---

### Task A5: credit_transactions refactor + entitlement_history + ledger reason enum

**Files:**
- Modify: `src/constants/domain.ts` (`LEDGER_REASONS`)
- Modify: `src/db/enums.ts`
- Modify: `src/features/credits/credits.schema.ts` (`credit_transactions` yeni model)
- Create: `src/db/schema/history.ts` (`entitlement_history`)
- Modify: `src/db/schema.ts`
- Test: `tests/db/ledger-schema.test.ts`

**Interfaces:**
- Produces: `creditTransactions` (signed amount, balanceAfter, reason enum, idempotencyKey, relatedDreamId SET NULL), `entitlementHistory` — Faz C tüketir.

- [ ] **Step 1: Constants + enum**

`src/constants/domain.ts`:
```ts
export const LEDGER_REASONS = ['purchase', 'admin_adjustment', 'dream_charge', 'dream_processing_refund'] as const;
export type LedgerReason = typeof LEDGER_REASONS[number];
```
`src/db/enums.ts`:
```ts
export const ledgerReasonEnum = pgEnum('ledger_reason', LEDGER_REASONS);
```

- [ ] **Step 2: credits.schema.ts yeniden yaz**

`src/features/credits/credits.schema.ts`:
```ts
import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../db/schema/auth';
import { ledgerReasonEnum } from '../../db/enums';

export const creditTransactions = pgTable('credit_transactions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  amount: integer('amount').notNull(),
  balanceAfter: integer('balance_after').notNull(),
  reason: ledgerReasonEnum('reason').notNull(),
  relatedDreamId: uuid('related_dream_id'), // FK ALTER ile A6'dan sonra (circular)
  idempotencyKey: text('idempotency_key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('credit_tx_user_created_idx').on(t.userId, t.createdAt.desc()),
  uniqueIndex('credit_tx_user_idempotency_uq').on(t.userId, t.idempotencyKey)
    .where(sql`${t.idempotencyKey} is not null`),
  uniqueIndex('credit_tx_dream_refund_uq').on(t.relatedDreamId)
    .where(sql`${t.reason} = 'dream_processing_refund'`),
  index('credit_tx_related_dream_idx').on(t.relatedDreamId),
  check('credit_tx_amount_nonzero', sql`${t.amount} <> 0`),
  check('credit_tx_balance_after_nonneg', sql`${t.balanceAfter} >= 0`),
]);
```

- [ ] **Step 3: entitlement_history**

`src/db/schema/history.ts`:
```ts
import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { billingProviderEnum, entitlementStatusEnum, planEnum, storeEnum } from '../enums';

export const entitlementHistory = pgTable('entitlement_history', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  previousPlan: planEnum('previous_plan'),
  newPlan: planEnum('new_plan').notNull(),
  previousStatus: entitlementStatusEnum('previous_status'),
  newStatus: entitlementStatusEnum('new_status').notNull(),
  billingProvider: billingProviderEnum('billing_provider').notNull(),
  store: storeEnum('store'),
  reason: text('reason'),
  effectiveAt: timestamp('effective_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('entitlement_history_user_created_idx').on(t.userId, t.createdAt),
  index('entitlement_history_effective_idx').on(t.effectiveAt),
]);
```

- [ ] **Step 4: barrel + migration + test (amount<>0 CHECK)**

`src/db/schema.ts`: `export * from './schema/history';` (credits zaten barrel'da).
```bash
bun run db:generate && bun run db:migrate
```
`tests/db/ledger-schema.test.ts`: `amount=0` reddedilmeli.
```ts
it('rejects zero amount via CHECK', async () => {
  await expect(db.execute(sql`
    INSERT INTO credit_transactions (user_id, amount, balance_after, reason)
    VALUES (NULL, 0, 0, 'purchase')`)).rejects.toThrow();
});
```
Run: `bun run test tests/db/ledger-schema.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/constants/domain.ts src/db/enums.ts src/features/credits/credits.schema.ts src/db/schema/history.ts src/db/schema.ts drizzle tests/db/ledger-schema.test.ts
git commit -m "feat(api): refactor credit ledger and add entitlement_history schema"
```

---

### Task A6: dreams schema — idempotency/recovery/billing + constraints + circular FK

**Files:**
- Modify: `src/constants/domain.ts` (`QUOTA_SOURCES`; `DREAM_STATUSES` korunur)
- Modify: `src/db/enums.ts` (`quotaSourceEnum`)
- Modify: `src/features/dreams/dreams.schema.ts`
- Test: `tests/db/dreams-schema.test.ts`

**Interfaces:**
- Produces: `dreams` (client_request_id/request_hash/recovery/billing kolonları, FK'ler, partial index'ler, status timestamp CHECK) — Faz C tüketir.

- [ ] **Step 1: quota_source constant + enum**

`src/constants/domain.ts`:
```ts
export const QUOTA_SOURCES = ['weekly_free', 'subscription_daily', 'wallet'] as const;
export type QuotaSource = typeof QUOTA_SOURCES[number];
```
`src/db/enums.ts`: `export const quotaSourceEnum = pgEnum('quota_source', QUOTA_SOURCES);`

- [ ] **Step 2: dreams.schema.ts kolonları + constraint + index**

`src/features/dreams/dreams.schema.ts` (mevcut kolonlar korunur; eklenenler):
```ts
// ... mevcut id/userId/interpreterId/content/interpretation/status/created/updated ...
clientRequestId: uuid('client_request_id').notNull(),
requestHash: char('request_hash', { length: 64 }).notNull(),
queuedAt: timestamp('queued_at', { withTimezone: true }),
processingStartedAt: timestamp('processing_started_at', { withTimezone: true }),
processingAttemptId: uuid('processing_attempt_id'),
processingLeaseExpiresAt: timestamp('processing_lease_expires_at', { withTimezone: true }),
attemptCount: integer('attempt_count').notNull().default(0),
lastError: text('last_error'),
completedAt: timestamp('completed_at', { withTimezone: true }),
failedAt: timestamp('failed_at', { withTimezone: true }),
quotaSource: quotaSourceEnum('quota_source'),
quotaKey: quotaKeyEnum('quota_key'),
quotaWindowStartedAt: timestamp('quota_window_started_at', { withTimezone: true }),
quotaUnitsConsumed: smallint('quota_units_consumed').notNull().default(0),
usedCoins: integer('used_coins').notNull().default(0),
usedCost: integer('used_cost').notNull().default(0),
chargedTransactionId: uuid('charged_transaction_id')
  .references(() => creditTransactions.id, { onDelete: 'restrict' }),
refundTransactionId: uuid('refund_transaction_id')
  .references(() => creditTransactions.id, { onDelete: 'restrict' }),
refundedAt: timestamp('refunded_at', { withTimezone: true }),
```
Table extras:
```ts
(t) => [
  index('dreams_user_created_idx').on(t.userId, t.createdAt.desc()),
  index('dreams_user_status_idx').on(t.userId, t.status),
  index('dreams_interpreter_idx').on(t.interpreterId),
  uniqueIndex('dreams_user_client_request_uq').on(t.userId, t.clientRequestId),
  index('dreams_pending_recovery_idx').on(t.queuedAt).where(sql`${t.status} = 'PENDING'`),
  index('dreams_processing_lease_idx').on(t.processingLeaseExpiresAt).where(sql`${t.status} = 'PROCESSING'`),
  check('dreams_attempt_count_nonneg', sql`${t.attemptCount} >= 0`),
  check('dreams_quota_units_nonneg', sql`${t.quotaUnitsConsumed} >= 0`),
  check('dreams_used_coins_nonneg', sql`${t.usedCoins} >= 0`),
  check('dreams_used_cost_nonneg', sql`${t.usedCost} >= 0`),
  check('dreams_completed_at_present', sql`${t.status} <> 'COMPLETED' OR ${t.completedAt} IS NOT NULL`),
  check('dreams_failed_at_present', sql`${t.status} <> 'FAILED' OR ${t.failedAt} IS NOT NULL`),
]
```
`creditTransactions` import'unu ekle (`../credits/credits.schema`); `char`/`smallint` import.
`credit_transactions.relatedDreamId` FK'sini şimdi bağla: `credits.schema.ts`'de `.references(() => dreams.id, { onDelete: 'set null' })` — **circular import** olacağından Drizzle relations yerine FK'yi migration sonrası ALTER ile kurmak gerekebilir. Pratik: Drizzle iki yönlü FK'de import döngüsünü `relations()` ile değil doğrudan `references` ile çözer ama TS circular import riski var. Çözüm: `relatedDreamId` FK'sini `credits.schema.ts`'de tanımlama; bunun yerine ayrı bir manuel migration SQL ile `ALTER TABLE credit_transactions ADD CONSTRAINT ... FOREIGN KEY (related_dream_id) REFERENCES dreams(id) ON DELETE SET NULL` ekle (drizzle generate sonrası elle eklenen migration; spec §3.2 circular-FK sırası).

- [ ] **Step 3: Migration üret, circular FK'yi elle migration'a ekle**

```bash
bun run db:generate
```
Üretilen son migration SQL'ine (veya yeni boş migration) ekle:
```sql
ALTER TABLE credit_transactions
  ADD CONSTRAINT credit_transactions_related_dream_fk
  FOREIGN KEY (related_dream_id) REFERENCES dreams(id) ON DELETE SET NULL;
```
```bash
bun run db:migrate
```

- [ ] **Step 4: Test — status/timestamp CHECK + idempotency unique**

`tests/db/dreams-schema.test.ts`:
```ts
it('rejects COMPLETED without completed_at', async () => {
  // seeded user + interpreter gerekli; helper kullan
  await expect(insertDream({ status: 'COMPLETED', completedAt: null })).rejects.toThrow();
});
it('rejects duplicate (user_id, client_request_id)', async () => {
  const crid = crypto.randomUUID();
  await insertDream({ clientRequestId: crid });
  await expect(insertDream({ clientRequestId: crid })).rejects.toThrow();
});
```
Run: `bun run test tests/db/dreams-schema.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/constants/domain.ts src/db/enums.ts src/features/dreams/dreams.schema.ts src/features/credits/credits.schema.ts drizzle tests/db/dreams-schema.test.ts
git commit -m "feat(api): add dream idempotency/recovery/billing columns and circular FK"
```

---

### Task A7: audit_logs schema + enum

**Files:**
- Modify: `src/constants/domain.ts` (`AUDIT_EVENTS`, `AUDIT_SOURCES`)
- Modify: `src/db/enums.ts`
- Create: `src/db/schema/audit.ts`
- Modify: `src/db/schema.ts`
- Test: `tests/db/audit-schema.test.ts`

**Interfaces:**
- Produces: `auditLogs` (actor/target nullable, event/source enum, jsonb metadata) — Faz D audit yazımı tüketir.

- [ ] **Step 1: Constants + enum**

`src/constants/domain.ts`:
```ts
export const AUDIT_EVENTS = ['SIGN_IN','SIGN_OUT','ACCOUNT_LINK','SESSION_REVOKE','PROFILE_BOOTSTRAP','ADMIN_ACTION','AUTH_FAILURE'] as const;
export type AuditEvent = typeof AUDIT_EVENTS[number];
export const AUDIT_SOURCES = ['api','webhook','admin','worker'] as const;
export type AuditSource = typeof AUDIT_SOURCES[number];
```
`src/db/enums.ts`:
```ts
export const auditEventEnum = pgEnum('audit_event', AUDIT_EVENTS);
export const auditSourceEnum = pgEnum('audit_source', AUDIT_SOURCES);
```

- [ ] **Step 2: audit.ts**

`src/db/schema/audit.ts`:
```ts
import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { auditEventEnum, auditSourceEnum } from '../enums';

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  targetUserId: uuid('target_user_id').references(() => users.id, { onDelete: 'set null' }),
  event: auditEventEnum('event').notNull(),
  source: auditSourceEnum('source').notNull(),
  requestId: text('request_id'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('audit_logs_target_created_idx').on(t.targetUserId, t.createdAt),
  index('audit_logs_event_created_idx').on(t.event, t.createdAt),
]);
```

- [ ] **Step 3: barrel + migration + test**

`src/db/schema.ts`: `export * from './schema/audit';`
```bash
bun run db:generate && bun run db:migrate
```
`tests/db/audit-schema.test.ts`: tablo + indeksler oluşmuş, `event` enum dışı değer reddedilir.
Run: `bun run test tests/db/audit-schema.test.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add src/constants/domain.ts src/db/enums.ts src/db/schema/audit.ts src/db/schema.ts drizzle tests/db/audit-schema.test.ts
git commit -m "feat(api): add audit_logs schema"
```

---

### Task A8: Faz A yeşil bariyeri — tam doğrulama

**Files:** (yok — doğrulama task'ı)

- [ ] **Step 1: Temiz DB'de migration baştan uygulanır**

```bash
docker compose down -v && docker compose up -d
# Postgres healthy bekle
bun run db:migrate
```
Expected: tüm migration'lar hatasız uygulanır.

- [ ] **Step 2: check + lint + test + coverage**

Run:
```bash
bunx tsc --noEmit
bun run lint
bun run test
bun run test:coverage
```
Expected: tsc temiz; lint temiz; tüm testler PASS; coverage gate %100 (gated modüllere yeni eklenenler için test mevcut).

- [ ] **Step 3: DB smoke — tablo envanteri**

```bash
bun run db:studio   # veya psql ile
```
Doğrula: `users, accounts, sessions, verifications, user_entitlements, user_usage, user_wallets, credit_transactions, entitlement_history, dreams, audit_logs, user_profiles, user_preferences, interpreters, ai_models, dictionary_entries, app_updates` mevcut; eski `users` custom kolonları (`auth_provider`, `provider_id`, `plan`, `weekly_dream_count`, `extra_credits`) **yok**.

- [ ] **Step 4: Commit (varsa migration meta düzeltmeleri)**

```bash
git add -A && git commit -m "chore(api): phase A green barrier — schema foundation complete"
```

---

## Sonraki planlar (Faz A merge sonrası ayrı dokümanlar)

Bu plan Faz A'yı bite-sized verir. Aşağıdakiler kendi plan dokümanlarına yazılır (her biri kendi issue grubu):

- **`2026-06-2X-api-phase-b-better-auth-runtime.md`** — handler mount (`app.on(['GET','POST'],'/api/auth/*', …)`), CORS→limiter→handler sırası, `authMiddleware` → `auth.api.getSession`, `jose`/Supabase JWT removal, env zod-required (GOOGLE_*/APPLE_* prod), dev email/password seed (`auth.api.signUpEmail`), `/api/auth/*` rate-limit contract testleri, secret redaction (Cookie/Set-Cookie).
- **`2026-06-2X-api-phase-c-domain-services.md`** — `ensureUserDomainState`, `getQuotaPolicy`, dream-create `ON CONFLICT` idempotency + atomik kota upsert + atomik wallet decrement, recovery claim (lease/attempt guard) + heartbeat + `transitionToFailedAndRefund` + sweeper, §9.0 worker test senaryoları.
- **`2026-06-2X-api-phase-d-audit-cleanup.md`** — audit/entitlement_history yazımı (databaseHooks + servis), Supabase env/kod/doküman temizliği (technical-decisions/infrastructure güncelle), live verification.
- **`2026-06-2X-app-1-better-auth-expo.md`** — native auth spike gate, supabase-js removal, `createAuthClient`+`expoClient`, Apple/Google `signIn.social({ idToken: { token, nonce } })`, cookie transport fetch wrapper, store/refresh rewrite, profile bootstrap, foreground getSession, pending-mutation idempotency + `GET /dreams/by-client-request-id/:id`.

## Self-Review (Faz A)

- **Spec coverage (Faz A kapsamı):** §3.1 auth tabloları (A3), §3.2 domain/ledger/dreams (A4/A5/A6), §3.4 history/audit (A5/A7), enum/constraint/index'ler (A4–A7), circular FK sırası (A6), Better Auth config + UUID + plural + conditional provider + apple secret (A2). Faz B–D/APP-1 kapsamı ayrı planlara devredildi (decomposition).
- **Placeholder:** yok — her step gerçek kod/komut içerir.
- **Type consistency:** `users`/`accounts`/`sessions`/`verifications` (A3) → domain/history/audit/dreams FK'leri aynı `users.id` UUID'ye bağlı; `creditTransactions.id` (A5) → `dreams.charged_/refund_transaction_id` (A6) tutarlı; enum constant tuple → pgEnum pattern mevcut `enums.ts` ile uyumlu.
