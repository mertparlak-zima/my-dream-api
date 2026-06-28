# Better Auth + PostgreSQL Migration (Supabase Removal) — Design Spec

- **Tarih:** 2026-06-21
- **Durum:** Onaylandı (brainstorm) — implementation plan'a geçilecek
- **Kapsam:** my-dream-api (API-1) + my-dream-app (APP-1) + docs/cleanup
- **Aşama:** Local-first (Coolify/Hetzner prod deploy bu spec dışında, referansla)

## 1. Amaç ve Karar

Self-hosted/Cloud Supabase tamamen kaldırılıyor. Yerine **PostgreSQL + Better Auth
(Hono API içine gömülü kütüphane) + Redis + (mevcut planlı) worker** geçiyor.

**Gerekçe:** Client yalnızca API'ye konuşuyor; DB'ye doğrudan bağlanmıyor. Bu yüzden
Supabase'in asıl değer önermeleri (RLS, PostgREST otomatik REST, Realtime, Storage,
Kong/Auth çoklu servis yükü) boşa düşüyor. Tek backend + tek Postgres + Better Auth
daha sade, ucuz ve kontrol edilebilir.

**Mevcut durumun gerçeği (migration'ı kolaylaştırıyor):**
- API zaten Supabase SDK kullanmıyor; `authMiddleware` sadece `jose` ile Supabase JWT
  doğruluyor (JWKS/HS). Drizzle + `postgres-js`.
- Supabase şu an yalnızca 3 şey için var: (a) auth provider (Apple/Google OAuth + JWT +
  refresh), (b) production Postgres (Cloud `dyzhdqcurixsysirthkn`), (c) Storage/avatar —
  **bu henüz yapılmamış, sadece planlı** (kapatılacak issue'lar).
- Henüz hiç kullanıcı kaydı yok → temiz cutover, veri migration'ı yok. Şema sıfırdan
  optimal kurulur.

**Scope dışı (sadece referans):** worker/BullMQ (Step 5), RevenueCat/IAP webhook ve
`subscriptions`/`webhook_events` tabloları (Monetization #10), Coolify/Hetzner prod
deploy.

## 2. Hedef Mimari

```text
Expo App  ──HTTPS + Cookie: <Better Auth session cookie>──▶  api.<domain>
   (authClient.getCookie() + credentials:'omit')                │
   ├── Hono API
   │     ├── Better Auth  (/api/auth/*)  — expo() plugin (bearer YOK)
   │     ├── App endpoints (dreams, credits, …)  — auth.api.getSession(headers)
   │     └── (payment webhooks — gelecekte)
   ├── PostgreSQL  (tek DB, public schema)
   │     ├── users / accounts / sessions / verifications  (auth source of truth)
   │     └── domain tabloları
   ├── Redis       (Hono rate-limit, cache, ileride BullMQ — auth'a bağlı DEĞİL)
   └── Worker      (mevcut planlı — bu spec dışı)
```

Tek makine (prod'da Hetzner+Coolify, bu spec dışı). Postgres/Redis dışarıya kapalı,
yalnız Docker network içinden. Local'de mevcut `docker-compose` (postgres:16 + redis:7).

## 3. Veritabanı Şeması (PostgreSQL / Drizzle)

**Konvansiyon:** tek `public` Postgres schema (ayrı `auth` schema YOK — Drizzle + Better
Auth CLI ile `search_path` sürtünmesi yaratır). snake_case kolon, UUID PK
(`gen_random_uuid()`), `timestamptz`. Tüm domain FK → `users.id`. Çoğul tablo isimleri
(Better Auth `usePlural:true` + `generateId:'uuid'`).

**Schema dosya ayrımı:** `src/db/schema/auth.ts` (Better Auth CLI generate),
`src/db/schema/domain.ts`, `src/db/schema/audit.ts` → barrel `src/db/schema/index.ts`,
`drizzle.config.ts` hepsini import eder. Tek migration geçmişi (`drizzle/`).

### 3.1 Kimlik katmanı (Better Auth sahibi)

| Tablo | Önemli kolonlar | İndeks / kısıt |
| :-- | :-- | :-- |
| `users` | id (uuid), email, email_verified, name, image, **first_name**, **last_name** (additionalFields, `input:false`), created_at, updated_at | `unique(email)`, `idx(created_at)` |
| `accounts` | id, user_id→users (**cascade**), provider_id, account_id, id_token, access_token, refresh_token, scope, password, expires…, timestamps | `unique(provider_id, account_id)`, `idx(user_id)` |
| `sessions` | id, user_id→users (**cascade**), token, expires_at, ip_address, user_agent, timestamps | `unique(token)`, `idx(user_id)`, `idx(expires_at)` |
| `verifications` | id, identifier, value, expires_at, timestamps | `idx(identifier)`, `idx(expires_at)` |

- `first_name`/`last_name`: Apple ilk-login / Google profile mapping ile **backend** set
  eder (`input:false` — client signup'ta yazamaz).
- OAuth token saklama minimuma indirilir (native idToken akışında provider API'si
  çağrılmıyor). Saklanırsa `encryptOAuthTokens:true`.

### 3.2 Domain katmanı — kimlik / faturalama / kullanım / cüzdan ayrı yaşam döngüleri

Eski `users.weekly_dream_count`/`extra_credits` + `credit_transactions(type)` modeli üç
ayrı sorumluluğa bölünür:

| Tablo | Sorumluluk / kolonlar | İndeks / kısıt | users silinince |
| :-- | :-- | :-- | :-- |
| `user_entitlements` | aktif plan: user_id PK→users, plan (**enum**), status (**enum**), expires_at (null=süresiz/free), **billing_provider** (enum: `revenuecat`/`admin`/`free`), **store** (enum null: `app_store`/`google_play`), updated_at | PK(user_id) | CASCADE |
| `user_usage` | ücretsiz kota penceresi: user_id+quota_key PK→users, quota_key (`weekly_free_dream`…), window_started_at, used_count, updated_at | PK(user_id, quota_key) | CASCADE |
| `user_wallets` | kredi bakiyesi: user_id PK→users, balance int `check(balance >= 0)`, updated_at | PK(user_id) | CASCADE |
| `credit_transactions` | değişmez ledger: id, user_id (**null**)→users, amount (signed: +10/−2), balance_after, **reason** (enum/check: `purchase`/`admin_adjustment`/`dream_charge`/`dream_processing_refund`), related_dream_id (null, **SET NULL**), idempotency_key (null, **backend-derived**: `dream-charge:<dream-id>` / `dream-refund:<dream-id>` — client ham değeri değil), created_at | `(user_id, created_at desc)`, `unique(user_id, idempotency_key) where not null`, `unique(related_dream_id, reason) where reason='dream_processing_refund'`, `idx(related_dream_id)` | **SET NULL** (anonim retention; cascade YOK) |

`dreams.charged_transaction_id` / `refund_transaction_id` → `credit_transactions.id` FK,
**`ON DELETE RESTRICT`** (ledger satırı yanlışlıkla silinince finansal referans sessizce
bozulmasın). reason enum/check + bu FK'ler ledger reconciliation ve refund unique'ini
güvenilir kılar.

**Circular FK migration sırası** (`credit_transactions.related_dream_id → dreams.id` ile
`dreams.charged_/refund_transaction_id → credit_transactions.id` döngüsü):
(1) `dreams`'i charged/refund FK olmadan oluştur, (2) `credit_transactions`'ı
`related_dream_id → dreams.id` ile oluştur, (3) `ALTER TABLE dreams` ile charged/refund
FK'lerini ekle. Runtime sırası: dream INSERT → wallet decrement → charge ledger INSERT →
`dreams.charged_transaction_id` UPDATE.

**`dreams` CHECK/constraint'leri:** `client_request_id UUID NOT NULL`,
`request_hash CHAR(64) NOT NULL`, `attempt_count INT NOT NULL DEFAULT 0 CHECK (>=0)`,
`quota_units_consumed SMALLINT NOT NULL DEFAULT 0 CHECK (>=0)`,
`used_coins INT NOT NULL DEFAULT 0 CHECK (>=0)`, `used_cost INT NOT NULL DEFAULT 0 CHECK (>=0)`,
`quota_source` **enum** (`weekly_free`/`subscription_daily`/`wallet`), `status` **enum**
(`PENDING`/`PROCESSING`/`COMPLETED`/`FAILED`) — **DB CHECK ile zorla:**
`status <> 'COMPLETED' OR completed_at IS NOT NULL` ve `status <> 'FAILED' OR failed_at IS NOT NULL`.

**Service-level invariant (assertion + contract test; tek FK doğrulayamaz):**
- `wallet`: `charged_transaction_id` zorunlu; `quota_key`/`quota_window_started_at` null;
  `quota_units_consumed=0`. Ledger satırı aynı user + `reason='dream_charge'` olmalı.
- `weekly_free`/`subscription_daily`: `charged_transaction_id` null;
  `quota_key`+`quota_window_started_at` zorunlu; `quota_units_consumed > 0`.
| `user_preferences` | text_size, language: user_id PK→users | PK(user_id) | CASCADE |
| `user_profiles` | zodiac vb. (MVP boş): user_id PK→users | PK(user_id) | CASCADE |
| `dreams` | mevcut + idempotency/recovery/billing: user_id→users, interpreter_id, status, **client_request_id** (not null), **request_hash** (not null), **queued_at**, **processing_started_at**, **processing_attempt_id** (uuid null), **processing_lease_expires_at**, **attempt_count**, **last_error**, **completed_at**, **failed_at**, **quota_source**, **quota_key** (null), **quota_window_started_at** (null), **quota_units_consumed** (smallint, default 0), **used_coins**, **used_cost**, **charged_transaction_id** (FK→credit_transactions, null), **refund_transaction_id** (FK→credit_transactions, null), **refunded_at**… | `(user_id, created_at desc)`, `(user_id, status)`, `idx(interpreter_id)`, `unique(user_id, client_request_id)`, **partial** `(queued_at) where status='PENDING'`, **partial** `(processing_lease_expires_at) where status='PROCESSING'` | **CASCADE** (kişisel içerik, privacy) |
| `interpreters`, `ai_models`, `dictionary_entries`, `app_updates` | değişmez (user'a bağlı değil) | mevcut indeksler | — |

**1:1 tablolarda** ayrı `id` + `unique(user_id)` yok; `user_id` doğrudan PK.
**FK on-delete özeti:** `accounts`/`sessions`/`user_preferences`/`user_profiles`/
`user_entitlements`/`user_usage`/`user_wallets`/`dreams` → **CASCADE**;
`credit_transactions`/`entitlement_history`/`audit_logs` → **SET NULL** (nullable user_id,
anonim retention).

### 3.3 Kullanım / kredi mantığı (cron yok, atomik, idempotent)

- **Kota policy tablosu (tek kaynak `getQuotaPolicy(quotaKey, now)`):**

  | quota_key | pencere | limit |
  | :-- | :-- | :-- |
  | `weekly_free_dream` | ISO hafta / **Pazartesi 00:00 UTC** | 1 |
  | `subscription_daily_dream` | takvim günü / **00:00 UTC** | plana göre (≥1) |

  Toplu cron reset YOK; her istekte server `getQuotaPolicy` ile mevcut pencere başını
  hesaplar. Cihaz timezone'u kotayı etkileyemez (UTC-everywhere). Dream'e yazılan
  `quota_key` + `quota_window_started_at`, refund'da **aynı policy** ile kullanılır. Kota
  tüketimi dream-create transaction'ının parçasıdır.
- **App kuralı (idempotency'nin çalışması için kritik):** `client_request_id`, kullanıcı
  "yorumla"ya **ilk bastığında** üretilir; ağ/timeout retry ve aynı pending isteğin yeniden
  gönderiminde **aynı UUID** kullanılır. **Yeni yorum isteği yeni UUID** üretir.
  - **App restart'a dayanıklı (kritik):** UUID yalnız RAM'de tutulursa app kapanınca/OS
    öldürünce yeni açılışta yeni UUID → duplicate dream/charge. Akış: basışta
    `client_request_id` **local pending-mutation kaydına yazılır** → HTTP isteği → server
    başarıyla cevaplayınca pending kayıt silinir. App açılışında pending kayıt varsa
    `GET /dreams/by-client-request-id/:id` ile server'da oluşmuş dream'i kontrol et; varsa
    o ekrana git, yoksa **aynı UUID + aynı payload** ile yeniden gönder.
  - Dream text hassas veri → pending payload'ın cihazda persist edilmesi **ürün kararı**;
    saklanacaksa lokasyon ve cihazda kalma riski bilinçli kabul edilir.
- **Dream-create idempotency (kritik):** ücretsiz kotada `credit_transactions` oluşmaz →
  credit idempotency double-submit'i korumaz. Bu yüzden idempotency **dream seviyesinde**:
  `dreams.client_request_id` **NOT NULL** + `unique(user_id, client_request_id)` (nullable
  kalırsa Postgres çok sayıda NULL'a izin verir → koruma çalışmaz). Ayrıca
  `dreams.request_hash` **NOT NULL** = `sha256(canonicalJson({ dreamText, interpreterId,
  language }))` — **yalnız immutable client payload**. Server state (aktif plan, wallet
  balance, güncel fiyat, `used_cost`, kota durumu) **hash'e KATILMAZ**; aksi halde retry'da
  server state değişince yanlış `409` üretir. Fiyat/kota kaynağı zaten dream'de
  `used_cost`/`used_coins`/`quota_source` olarak kalıcı, retry kontrolünün parçası değil.
  Akış (tek PG transaction). **Düz `INSERT` kullanma** — unique violation transaction'ı
  abort eder, sonra aynı transaction'da `SELECT` yapılamaz. `ON CONFLICT DO NOTHING`:
  ```sql
  INSERT INTO dreams (...) VALUES (...)
  ON CONFLICT (user_id, client_request_id) DO NOTHING
  RETURNING id, request_hash;
  ```
  (1) `ensureUserDomainState(tx, userId)` (§3.6). (2) yukarıdaki INSERT:
  - **satır döndü** → yeni request; kota/kredi tüketimine devam.
  - **satır dönmedi** → mevcut dream'i `SELECT`; `request_hash` **aynıysa** mevcut dream'i
    dön, **farklıysa** `409 IDEMPOTENCY_KEY_REUSED`. (Nadir concurrent visibility'de
    `READ COMMITTED` altında `SELECT` de boş dönerse → tüm transactional fn'i **bir kez
    retry** et.)
  (3) kota **veya** kredi kullanımını atomik uygula; **kota upsert'inden dönen
  `window_started_at` + `quota_key` + birim aynı transaction'da dream'e yazılır**
  (`quota_key`/`quota_window_started_at`/`quota_units_consumed`), kredi yolunda
  `charged_transaction_id`/`used_coins`/`used_cost`. (4) gerekiyorsa `credit_transactions`
  yaz. (5) status `PENDING` + `queued_at`. (6) commit. (7) commit sonrası işle.
  - **Kural:** aynı `client_request_id`, ilk dream `FAILED` + refund edilmiş olsa bile yeni
    dream yaratmaz → eski sonucu döner. Kullanıcı tekrar denemek isterse **yeni
    `client_request_id`** üretir (idempotency'nin gerçek anlamı korunur).
- **Kredi düşümü atomik:** JS'te `SELECT`+hesap YOK. `UPDATE user_wallets SET balance =
  balance - $cost … WHERE user_id=$id AND balance >= $cost RETURNING balance;` — dönen
  satır yoksa bakiye yetersiz. Aynı transaction'da `credit_transactions` (signed `amount`,
  `balance_after`) yazılır.
- **Kota tüketimi — tek SQL upsert (rollover + increment + limit atomik):** iki ayrı
  query (window-roll sonra increment) yarış koşulu bırakır. Tek statement:
  ```sql
  INSERT INTO user_usage (user_id, quota_key, window_started_at, used_count, updated_at)
  VALUES ($1, $2, $window_start, 1, now())
  ON CONFLICT (user_id, quota_key) DO UPDATE
  SET window_started_at = EXCLUDED.window_started_at,
      used_count = CASE WHEN user_usage.window_started_at < EXCLUDED.window_started_at
                        THEN 1 ELSE user_usage.used_count + 1 END,
      updated_at = now()
  WHERE user_usage.window_started_at < EXCLUDED.window_started_at
     OR (user_usage.window_started_at = EXCLUDED.window_started_at
         AND user_usage.used_count < $limit)
  RETURNING used_count, window_started_at;
  ```
  `$window_start` = mevcut UTC haftasının Pazartesi 00:00'ı (server hesaplar). **Satır
  dönmezse kota dolu** → paralel iki istek limiti aşamaz.
- **DB CHECK'leri:** `user_wallets.balance >= 0`, `user_usage.used_count >= 0`,
  `credit_transactions.amount <> 0`, `credit_transactions.balance_after >= 0`.

### 3.4 History (tipli, immutable) vs Audit (hafif, generic)

**Tasarım kuralı:** önemli durum değişiklikleri **tipli history tablolarında** (yapılı
kolon + integrity); `audit_logs` yalnız **kritik-olmayan iz/gözlem** için, hiçbir şeyin
integrity kaynağı değil.

**History tabloları (immutable — INSERT+SELECT, UPDATE/DELETE yok):**

| Tablo | Sorumluluk / kolonlar | İndeks | users silinince |
| :-- | :-- | :-- | :-- |
| `credit_transactions` | cüzdan hareket history'si (§3.2) | (bkz. §3.2) | SET NULL |
| `entitlement_history` | plan/status değişim geçmişi: id, user_id (null)→users, previous_plan, new_plan, previous_status, new_status, billing_provider, store, reason, effective_at, created_at | `(user_id, created_at)`, `idx(effective_at)` | SET NULL |

**Audit (hafif generic iz):**

| Tablo | Kolonlar | İndeks | users silinince |
| :-- | :-- | :-- | :-- |
| `audit_logs` | id, actor_user_id (null)→users, target_user_id (null)→users, event (enum), source (`api`/`webhook`/`admin`/`worker`), request_id (null), ip_address (null), user_agent (null), metadata jsonb, created_at | `(target_user_id, created_at)`, `(event, created_at)` | SET NULL |

- `audit_logs` integrity kaynağı **değildir**; finansal/entitlement gerçeği
  `credit_transactions`/`entitlement_history`'dedir. Audit yalnız hafif olaylar:
  `SIGN_IN`, `SIGN_OUT`, `ACCOUNT_LINK`, `SESSION_REVOKE`, `PROFILE_BOOTSTRAP`,
  `ADMIN_ACTION`, `AUTH_FAILURE` — gerektikçe genişler.
- Auth olayları Better Auth `databaseHooks` + auth servis katmanında yazılır
  (sign-out/revoke yalnız hook'a bırakılmaz). Plan değişimi → `entitlement_history`
  (servis katmanı); kredi → `credit_transactions` (servis).
- **`audit_logs.metadata` whitelist + boyut limiti** (sınırsız jsonb büyümesi yok).
  metadata'ya token, email, receipt, Apple private key, raw Authorization header
  **yazılmaz** (Sentry scrubber disipliniyle uyumlu).
- **Append-only enforcement:** MVP'de app-level; production'da runtime DB role'üne
  immutable tablolar (`credit_transactions`, `entitlement_history`, `audit_logs`) için
  yalnız SELECT+INSERT (UPDATE/DELETE yok); `user_wallets` mutable → UPDATE alır, DELETE
  almaz; migration role'ü ayrı — ayrı **production hardening issue**.

### 3.5 Gelecek tablolar (bu spec'te YARATILMAZ)

- `subscriptions` (provider/product/transaction history, raw_payload jsonb) ve
  `webhook_events` (idempotency) — payments milestone (Monetization #10).
- `outbox_events` — kredi düşüp queue enqueue patlarsa iş kaybını önler; worker
  milestone (Step 5). Bu spec'te in-process processing korunur.

Sadece tasarım referansı; boş/kullanılmayan tablo açılmaz.

### 3.6 Domain provisioning ve PENDING recovery

- **Default-row provisioning:** kullanıcıya bağlı 1:1 satırların oluşumu **hook'a
  bırakılmaz** (Better Auth user-create hook sonrası hata olursa user oluşur ama wallet
  oluşmaz). Bunun yerine `ensureUserDomainState(tx, userId)`:
  - `user_entitlements`: plan=`free`/status=`active`/billing_provider=`free`/store=null ile `INSERT … ON CONFLICT DO NOTHING`
  - `user_wallets`: `balance=0` ile `INSERT … ON CONFLICT DO NOTHING`
  - `user_preferences`: default language/text_size ile `INSERT … ON CONFLICT DO NOTHING`

  Bu fonksiyon **her request'te değil**, yalnız domain mutasyon/kritik noktaların başında
  **aynı transaction içinde** çağrılır (dream create, wallet mutation, entitlement
  read/write, profile/preferences mutation). `GET /me` provisioning yazmaz — eksik satırlar
  için `LEFT JOIN` + default değer döner (veya ilk authenticated domain çağrısında lazy).
  `user_usage` ilk kota tüketiminde upsert ile, `user_profiles` lazy oluşur. (Better Auth
  user-create hook'u yalnız audit/profil mapping için; domain state garantisi değil.)
- **Dream recovery — PENDING + stale PROCESSING (outbox öncesi zorunlu):** in-process
  işlemede commit sonrası crash → "kalıcı PENDING"; AI çağrısı sırasında crash → "kalıcı
  PROCESSING" riski. İkisi de kapsanır. **Lease'li koşullu atomik claim:**
  ```sql
  UPDATE dreams SET status='PROCESSING', processing_attempt_id=$attempt,
    processing_started_at=now(), processing_lease_expires_at=now()+interval '5 minutes',
    attempt_count=attempt_count+1
  WHERE id=$id AND attempt_count < $max_attempts
    AND (status='PENDING'
      OR (status='PROCESSING' AND processing_lease_expires_at < now()))
  RETURNING *;
  ```
  **Attempt limiti claim SQL'inin İÇİNDE** (`attempt_count < $max_attempts`) — limit aşılsa
  bile fazladan AI çağrısı başlamaz. İki işleyici aynı dream'i alamaz.
- **Lease heartbeat:** AI çağrısı 5 dk'yı aşabilir → worker işlerken **60-90 sn'de bir**
  lease yeniler: `UPDATE dreams SET processing_lease_expires_at=now()+interval '5 minutes'
  WHERE id=$id AND processing_attempt_id=$attempt AND status='PROCESSING';`. Aksi halde ilk
  worker hâlâ çalışırken recovery ikinci AI çağrısını başlatır (gereksiz maliyet).
  **Heartbeat satır döndürmezse worker lease'i kaybetmiş sayar** → `AbortController` ile AI
  isteğini iptal eder, hiçbir sonuç yazmaz (attempt-id guard ezilmeyi önler ama boşuna
  maliyeti tek başına engellemez).
- **Attempt limiti dolunca terminal transition (recovery 2. adım):** limit dolan dream
  artık claim edilemez ama PENDING/stale-PROCESSING'de asılı kalır. Recovery onu sonlandırır:
  ```sql
  UPDATE dreams SET status='FAILED', failed_at=now(), last_error='MAX_ATTEMPTS_EXCEEDED',
    processing_lease_expires_at=NULL
  WHERE id=$id AND attempt_count >= $max_attempts
    AND (status='PENDING' OR (status='PROCESSING' AND processing_lease_expires_at < now()))
  RETURNING *;
  ```
  Dönen satır için refund transaction'ı çalıştır.
- **Durum makinesi (net):** `PENDING → PROCESSING → COMPLETED`. Geçici provider/network
  hatası: `PROCESSING → PENDING` (`queued_at=now()`, lease=null). Kalıcı hata veya attempt
  limiti: `PENDING/PROCESSING → FAILED` (`failed_at=now()` + refund).
- **Attempt-id guard HER worker transition'ında** (`COMPLETED` + `PROCESSING→PENDING` geçici
  hata + `PROCESSING→FAILED` kalıcı hata + heartbeat + `last_error`/lease yazımı):
  `WHERE id=$id AND processing_attempt_id=$attempt`. Aksi halde guard sonucu ezmeyi önler
  ama geç kalan eski worker state'i bozar. Örn. geçici hata:
  ```sql
  UPDATE dreams SET status='PENDING', queued_at=now(), processing_attempt_id=NULL,
    processing_started_at=NULL, processing_lease_expires_at=NULL, last_error=$code
  WHERE id=$id AND status='PROCESSING' AND processing_attempt_id=$attempt;
  ```
  `PROCESSING→PENDING`'de `processing_started_at`/`processing_attempt_id`/lease temizlenir.
  `last_error` raw AI body değil **normalize kod** (`AI_TIMEOUT`/`PROVIDER_5XX`/
  `MAX_ATTEMPTS_EXCEEDED`…); opsiyonel message kısa + scrub'lı.
- **`FAILED` + refund TEK transaction (`transitionToFailedAndRefund(tx, dreamId, attemptId,
  errorCode)`):** worker `FAILED` yazıp refund'dan önce ölürse para/kota iadesiz başarısız
  dream kalır. Bu yüzden tek servis kuralı, aynı PG transaction'da: (1) `PROCESSING→FAILED`
  attempt-guard'lı update, (2) `refunded_at IS NULL` atomik claim
  (`UPDATE dreams SET refunded_at=now() WHERE id=$dreamId AND status='FAILED' AND
  refunded_at IS NULL RETURNING *;` — dönmezse zaten iade, çık), (3) wallet **veya** kota
  iadesi, (4) refund ledger insert, (5) `refund_transaction_id` update, (6) commit.
  - Wallet yolu: `user_wallets.balance` artır + `credit_transactions` refund satırı.
  - Kota yolu (**dream'de saklı pencereye**, `$dream_user_id` ile — `$id`/dream-id ile
    bind etme, sessizce çalışmaz):
    ```sql
    UPDATE user_usage SET used_count=used_count-$units, updated_at=now()
    WHERE user_id=$dream_user_id AND quota_key=$dream_quota_key
      AND window_started_at=$dream_quota_window_started_at AND used_count >= $units;
    ```
    Satır dönmezse kota zaten yeni pencereye geçmiş (yeni hafta hakkı sıfırdan), ekstra
    işlem yok. Refund tek sefer: `unique(related_dream_id, reason) where
    reason='dream_processing_refund'`.
- **Refund sweeper:** startup/periyodik recovery `WHERE status='FAILED' AND refunded_at IS
  NULL` dream'leri bulur ve aynı servisin **yalnız refund kısmını** tekrar çağırır (FAILED
  yazılıp refund'dan önce crash senaryosunu kapatır).

## 4. Better Auth Konfigürasyonu (API)

`src/auth/auth.ts` hedef config:

```ts
// TÜM bağımlılıklar betterAuth() çağrısından ÖNCE tanımlanır (forward-reference / TDZ yok).
const trustedOrigins = [
  'myapp://', 'https://appleid.apple.com',
  ...(env.NODE_ENV !== 'production' ? ['myapp-dev://', 'exp://**'] : []),
];

// Her iki provider da yalnız tüm env'leri varsa register edilir (dev'de eksikse eklenmez).
const hasGoogleConfig = Boolean(
  env.GOOGLE_WEB_CLIENT_ID && env.GOOGLE_IOS_CLIENT_ID &&
  env.GOOGLE_ANDROID_CLIENT_ID && env.GOOGLE_WEB_CLIENT_SECRET,
);
const hasAppleConfig = Boolean(
  env.APPLE_SERVICE_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID &&
  env.APPLE_PRIVATE_KEY && env.APPLE_APP_BUNDLE_IDENTIFIER,
);
const socialProviders = {
  ...(hasGoogleConfig ? {
    google: {
      clientId: [env.GOOGLE_WEB_CLIENT_ID!, env.GOOGLE_IOS_CLIENT_ID!, env.GOOGLE_ANDROID_CLIENT_ID!],
      clientSecret: env.GOOGLE_WEB_CLIENT_SECRET!,
    },
  } : {}),
  ...(hasAppleConfig ? {
    apple: async () => ({
      clientId: env.APPLE_SERVICE_ID!,
      clientSecret: await generateAppleClientSecret(
        env.APPLE_SERVICE_ID!, env.APPLE_TEAM_ID!, env.APPLE_KEY_ID!,
        env.APPLE_PRIVATE_KEY!.replace(/\\n/g, '\n'), // Coolify/env \n kaçışları normalize
      ),
      appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER!, // native idToken audience
    }),
  } : {}),
};

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', usePlural: true, schema }),
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  advanced: { database: { generateId: 'uuid' } },
  // secondaryStorage VERİLMEZ → session/verification Postgres'te (tek source of truth).
  // Redis sadece Hono rate-limit/cache/BullMQ'da kalır; auth'a bağlanmaz.
  socialProviders,
  account: {
    encryptOAuthTokens: true, // saklanırsa şifreli (asıl hedef: token saklamamak)
    accountLinking: {
      enabled: true,
      // trustedProviders YOK → verified-email olmadan zorla link riski kapatıldı
      allowDifferentEmails: false, // farklı-email (Apple Private Relay) merge YOK
      allowUnlinkingAll: false,
    },
  },
  user: { additionalFields: {
    firstName: { type: 'string', required: false, input: false },
    lastName:  { type: 'string', required: false, input: false },
  }},
  emailAndPassword: { enabled: env.NODE_ENV !== 'production' }, // sadece dev/test
  rateLimit: { enabled: false }, // Better Auth internal kapalı; /api/auth/* Hono+Redis limiter ile
  // Session policy: 30 gün INACTIVITY expiry + aktif kullanıcılar için rolling renewal
  // (updateAge günde bir uzatır). "30 gün sonra zorunlu logout" DEĞİL. Hard expiry
  // gerekirse disableSessionRefresh:true. freshAge: DELETE /me gate'i için 10 dk.
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24, freshAge: 60 * 10 },
  plugins: [expo()], // bearer() YOK — Expo cookie transport
  // cookieCache AÇILMAZ: revoke edilen session DB'den anında geçersiz (anlık logout).
  trustedOrigins, // yukarıda env-temelli tanımlı (prod: gerçek scheme + Apple host)
});
```

- **Provider env (prod-required / dev-conditional):** Apple provider config Service ID +
  generated secret + appBundleIdentifier ile sabittir. `APPLE_SERVICE_ID`/`TEAM_ID`/
  `KEY_ID`/`PRIVATE_KEY`/`APPLE_APP_BUNDLE_IDENTIFIER` **production'da zod-required**
  (fail-fast). Dev/test'te opsiyonel; eksikse Apple provider **register edilmez** (local
  email/password + `X-Dev-User-Id` ile çalışılır, Apple native flow yalnız cihaz/TestFlight).
  **Google de aynı kuralla:** `GOOGLE_*` prod'da zod-required; dev'de eksikse Google
  provider register edilmez (`undefined` client-ID array'iyle provider yaratılmaz). Bu,
  local-first'i provider secret'larını zorunlu kılmadan korur. (Google client-ID array
  yalnız idToken audience'ı genişletir; authorization-code flow ilk eleman = web callback
  client ID + tek secret üzerinden gider.)
- **secondaryStorage yok:** Better Auth secondaryStorage verilince session/verification
  Redis'e taşınır; Redis eviction/restart'ta oturum/OAuth state kaybolur. V1'de Postgres
  auth için tek kaynak; Redis auth'a dokunmaz.
- **Rate-limit:** Better Auth internal kapalı. `/api/auth/*` mevcut **Hono+Redis**
  sliding-window limiter (#65 hardening) ile korunur; hassas auth path'lerine (sign-in,
  email/password) per-route sıkı limit. Postgres'e rate-limit yazımı YOK. **Mount sırası:
  limiter handler'dan ÖNCE** —
  `app.use('/api/auth/*', authRateLimiter); app.on(['GET','POST'], '/api/auth/*', c => auth.handler(c.req.raw));`
- **Transport:** `bearer()` çıkarıldı; Expo cookie transport (`authClient.getCookie()` →
  `Cookie` header). Tek transport, set-auth-token yönetimi derdi yok.
- **Migration sahibi Drizzle Kit.** Better Auth CLI **pinli** sürümle yalnız `generate`
  (CI/deploy'da `@latest` YOK): generate → geçici dosya → diff → bilinçli merge
  `src/db/schema/auth.ts` → `bun run db:generate` → SQL migration review → `db:migrate`.
- `disableCSRFCheck` / `disableOriginCheck` **açılmaz**.
- **Account linking kararı (V1):** `trustedProviders` **kullanılmaz** (verified-email
  olmadan zorla link → account-takeover riski). `allowDifferentEmails:false` → farklı-email
  linking desteklenmez; Apple Private Relay + Google ayrı kişi gibi görünür. Verified-email
  ile normal linking çalışır; otomatik merge asla yapılmaz.

## 5. Auth Akışı

**API:**
- Better Auth handler `/api/auth/*`'a mount.
- `authMiddleware` → `auth.api.getSession({ headers: c.req.raw.headers })`; geçersizse
  401 `AuthError`. `c.set('userId', session.user.id)`. Eski `jose`/JWKS/Supabase JWT
  doğrulama kaldırılır.
- `X-Dev-User-Id` bypass yalnız `DEV_AUTH_ENABLED` (dev/test) altında kalır; prod'da
  startup validation ile fail-closed.
- Hiçbir endpoint client `userId`'sine güvenmez → her sahiplik sorgusu
  `WHERE … AND user_id = session.user.id` (IDOR guard, repository/service'te standart).
- **Apple isim/email capture:** Apple email/fullName yalnız ilk authorization'da gelir
  (sonraki girişlerde null). `mapProfileToUser`'a tek başına güvenilmez. App, alanlar
  boşsa **`POST /me/profile/bootstrap`** ile `firstName`/`lastName` gönderir; bu **profil
  verisi** olarak `users.first_name/last_name`'e yazılır, audit'e `PROFILE_BOOTSTRAP`.
  **Yalnız ilk doldurma:** SQL `… WHERE first_name IS NULL AND last_name IS NULL` (login
  olmuş biri isim alanlarını sonradan sürekli değiştiremez); Zod ile uzunluk/karakter
  limiti. Google'da `mapProfileToUser(given_name/family_name)`.
- **Account deletion:** Better Auth raw delete endpoint açılmaz. Custom **`DELETE /me`**
  (release milestone) bir **deletion service** içinde (route doğrudan `DELETE FROM users`
  çalıştırmaz). **V1 net kararı (veya bırakılmaz):** (1) `DELETE /me` yalnız
  `session.created_at` son **10 dakika** içindeyse çalışır (freshness kontrolü endpoint'in
  KENDİSİNDE; `freshAge` config'i yalnız yerleşik Better Auth endpoint'lerini kapsar),
  (2) kullanıcı kaydı **fiziksel silinir**, (3) ledger/audit satırları FK **SET NULL** ile
  anonim kalır. (Provider re-auth sonradan eklenebilir; V1'de tek kural: 10 dk fresh.)
  **Audit sırası:** deletion audit event'i **kullanıcı silinmeden ÖNCE** yazılır (sonra FK
  hedefi kalmaz); metadata'ya email konmaz, rastgele `deletion_request_id` yazılır. Sonra:
  tüm session revoke → accounts/preferences/profiles/usage/wallets/dreams sil (cascade) →
  credit_transactions/entitlement_history/audit FK'leri SET NULL → user fiziksel sil.
  Apple/Google store zorunluluğu.

**App (Expo):**
- `@supabase/supabase-js` kaldırılır. Better Auth **Expo client** + `expo-secure-store`:

  ```ts
  export const authClient = createAuthClient({
    baseURL: env.EXPO_PUBLIC_API_URL,
    plugins: [expoClient({ scheme: 'myapp', storagePrefix: 'myapp', storage: SecureStore })],
  });
  ```
- Apple: `expo-apple-authentication` identityToken (scope FULL_NAME+EMAIL) →
  `authClient.signIn.social({ provider:'apple', idToken: { token: identityToken, nonce } })`.
  Google: `signIn.social({ provider:'google', idToken: { token: googleIdToken } })`
  (`accessToken` yalnız gerçekten Google API çağrılacaksa). **idToken raw string değil,
  `{ token, nonce? }` object** (güncel Better Auth ID-token akışı).
- **Transport: Expo cookie** — session SecureStore'da Expo plugin tarafından yönetilir.
  Standart fetch wrapper: `Cookie: authClient.getCookie()` header (varsa) + `credentials:'omit'`.
  AsyncStorage'a yazılmaz; log/crash-report/response'a çıkmaz.
- `auth-provider.ts`, `refreshAuthSession`, `auth-store` token mantığı Expo client'a
  göre yeniden yazılır. **Foreground/app-açılışında `getSession`**; 401'de local auth
  cache temizle + logout (mevcut focus-driven loader pattern'iyle uyumlu).
- `trustedOrigins`: prod yalnız gerçek app scheme; `exp://**` **yalnız development**
  modunda (Expo Go); custom dev build'de `myapp-dev://`.
- Apple native flow **gerçek cihaz / TestFlight**'ta doğrulanır (local email-password
  middleware'i doğrular ama Apple entegrasyonunu doğrulamaz).
- **Sürüm uyumu — native auth spike (production migration ÖNCESİ gate):** Better Auth
  güncel Expo rehberi `@better-auth/expo` + `expo-secure-store` + `expo-network` gerektirir
  ve daha yeni Expo SDK üzerinden yazılmıştır (mevcut SDK 54). Migration'a girmeden küçük
  spike: (1) Expo client init, (2) SecureStore cookie yazıldı mı, (3) `getSession`, (4)
  Apple/Google idToken girişi gerçek cihazda, (5) foreground sonrası cookie restore.

## 6. Env / Config (zod-required, `src/config/env.ts`)

**Eklenir (net isimler):**
- `BETTER_AUTH_SECRET` (≥32), `BETTER_AUTH_URL`
- `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`,
  `GOOGLE_WEB_CLIENT_SECRET`
- `APPLE_APP_BUNDLE_IDENTIFIER` (native idToken audience), `APPLE_SERVICE_ID`,
  `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` — **production'da zod-required**
  (Apple provider config sabit Service ID + generated secret formunda); **dev/test'te
  opsiyonel** (eksikse Apple provider register edilmez, local-first korunur)

Mevcut: `DATABASE_URL`, `REDIS_URL`, `OPENROUTER_API_KEY`, `CORS_ALLOWED_ORIGINS`.
Belirsiz `GOOGLE_CLIENT_ID(S)` ismi kullanılmaz.

**Kaldırılır:** tüm `SUPABASE_*`, `JWT_SECRET`, `SUPABASE_JWKS_URL`,
`SUPABASE_JWT_ISSUER`. `postgres-js` `prepare:false` (Supabase pooler'a özeldi) kaldırılır.

Production'da eksik/yanlış env → fail-fast (mevcut `parseRuntimeEnv` disiplini). Secret'lar
client'a sızmaz; `EXPO_PUBLIC_*` yalnız public değerler (API URL, app scheme).

**Secret rotation notu (versioned, kesintisiz):** tek secret'ı doğrudan değiştirmek toplu
logout + şifreli OAuth token'ların okunamaması demektir. Better Auth **versioned secrets**
destekler. Format: `BETTER_AUTH_SECRETS=2:new-secret-base64,1:old-secret-base64` (ilk/en
yüksek versiyon = current; eski key'ler yalnız decrypt). `BETTER_AUTH_SECRET` versioned
envelope öncesi veriler için fallback kalabilir. Rotasyon: (1) yeni key'i en başa ekle,
(2) deploy, (3) eski key'i en az max session/cookie ömrü (30 gün) tut, (4) sonra kaldır.

## 7. Local / Test Stratejisi

- `docker compose up -d` (postgres:16 + redis:7) → `bun run db:migrate` → `bun run db:seed:local`.
- **İki katmanlı test auth:**
  - `X-Dev-User-Id` bypass: hızlı unit/contract testleri (mevcut, korunur).
  - Dev-only `emailAndPassword`: seeded test user ile gerçek Better Auth session/token
    akışı (middleware, getSession, cookie transport) localde Apple cihazı olmadan
    denenir. **Prod'da kapalı.** (Apple native flow yalnız gerçek cihaz/TestFlight'ta.)
- Seed: local dev user + canonical model/interpreters (mevcut akış); prod seed
  çalışmaz. **Test user raw SQL ile oluşturulmaz** (yanlış password hash / provider kaydı
  riski) — Better Auth API ile: `await auth.api.signUpEmail({ body: { email, password,
  name } })`, sonra `ensureUserDomainState` ile domain default satırları.
- **Live verification:** contract işinden önce gerçek endpoint curl ile doğrulanır
  (mevcut kural).

## 8. Kapsam ve Milestone Bölünmesi

- **API-1 — Better Auth + Postgres + Supabase removal:** auth/domain/history/audit şema +
  Better Auth config + `authMiddleware` swap + `ensureUserDomainState` provisioning +
  credits/usage/wallet/entitlement servis refactor (transaction + dream-level idempotency +
  atomik kota/kredi) + PENDING dream recovery + audit/entitlement_history yazımı +
  `/api/auth/*` rate-limit contract testleri + Supabase env/kod temizliği + local docker
  test + coverage gate korunur (%100).
- **APP-1 — Better Auth Expo client migration:** **önce native auth spike gate** (`@better-auth/expo`
  + `expo-secure-store` + `expo-network` sürüm uyumu, SDK 54), sonra supabase-js removal,
  Apple/Google idToken sign-in (Expo cookie transport), store/refresh rewrite, profile
  bootstrap, foreground getSession, zod response retrofit, coverage gate (%100).
- **Docs/Cleanup:** stale Supabase milestone (Step 6) + issue'ları (#32-38, #35) kapat;
  api `technical-decisions.md` / `technical-infrastructure.md` Supabase bölümlerini
  Better Auth/Postgres'e göre güncelle; `subscriptions`/`webhook_events`/`outbox_events`
  tasarımını payments/worker milestone'una referansla. project-docs'ta yalnız stale bilgi
  silinir.
- **Release milestone'a eklenir:** custom `DELETE /me` account deletion flow (API + App,
  Apple/Google store zorunluluğu).
- **Hardening issue (ayrı):** immutable tablolar için runtime DB-role SELECT+INSERT
  enforce; Coolify reverse-proxy `X-Forwarded-For` spoof koruması (#65 IP keying ile).

## 9. Güvenlik Invariantları (özet)

- IDOR guard: her kaynak erişimi server-side ownership kontrolü (`user_id = session.user.id`).
- Coin/kota: tek PG transaction + dream-level idempotency (`client_request_id`) + atomik
  `UPDATE … WHERE balance >= cost RETURNING`; client `isPremium`/`plan`/`balance`'a güven yok.
- Rate-limit: Better Auth internal **kapalı**; mevcut **Hono+Redis** middleware `/api/auth/*`
  (sign-in/email-password sıkı per-route), AI interpretation, ödeme verify, mail/OTP,
  password reset (dev), upload uçlarına. Postgres'e rate-limit yazımı yok.
- No silent fallback: Redis/Postgres kritik bağımlılık; ayakta değilse fail-loud (5xx),
  sessiz degrade yok. Config env+zod required.
- Account linking kontrollü (farklı-email otomatik merge yok); CSRF/origin check açık.
- **Middleware sırası:** `app.use('/api/auth/*', corsMiddleware)` → `app.use('/api/auth/*',
  authRateLimiter)` → `app.on(['GET','POST'], '/api/auth/*', c => auth.handler(c.req.raw))`.
  CORS ve limiter handler'a ulaşmadan ÖNCE çalışır.
- **Secret redaction:** request logger / reverse-proxy access log / Sentry request context /
  error serializer asla kaydetmez: `Authorization`, **`Cookie`**, **`Set-Cookie`**,
  **`better-auth.session_token`**, token/secret/email/receipt. `audit_logs.metadata`
  whitelist + boyut limiti (session cookie tabanlı çalışır; cookie'ler loglanmamalı).
- Immutable tablolar (`credit_transactions`/`entitlement_history`/`audit_logs`) append-only
  (prod'da DB-role enforce — ayrı hardening issue); `user_wallets` mutable (UPDATE, no DELETE).
- Prod reverse-proxy `X-Forwarded-For` spoof edilemez; IP yalnız Coolify/Nginx'in set
  ettiği değerden okunur, client başlığına güvenilmez (rate-limit/IP audit).
- **Rate-limit contract testleri (zorunlu):** `/api/auth/sign-in/social|email`,
  `/sign-up/email`, `/forgot-password` için: aynı IP'den limit aşımında `429`;
  Redis kapalıyken fail-loud; **limiter handler'dan ÖNCE** çalışır (handler limiter'dan
  sonra mount → bypass yok); client'ın gönderdiği sahte `X-Forwarded-For` kullanılmıyor.

### 9.0 Worker/recovery test senaryoları (zorunlu)

- Eski attempt, yeni attempt başladıktan sonra `FAILED`/`COMPLETED` **yazamaz** (attempt guard).
- Lease heartbeat kaybolan worker sonucu **yazamaz** (AI iptal).
- `FAILED + refunded_at IS NULL` sweeper iadeyi yapar (tam bir kez).
- App restart sonrası aynı `client_request_id` tekrar kullanılır → duplicate dream/charge yok.
- Aynı kullanıcıdan paralel iki kota isteğinde **yalnız biri** ücretsiz hak tüketir.
- Refund hafta sınırında yanlış pencereyi azaltmaz (yeni pencerede no-op).

### 9.1 Operasyon notları

- **Cleanup policy:** süresi geçmiş `sessions` ve `verifications` periyodik temizlenir
  (`expires_at` indeksleri bunun için).
- **Reconciliation:** periyodik `user_wallets.balance` vs `SUM(credit_transactions.amount)`
  tutarlılık sorgusu (drift alarmı).
- **Better Auth CLI** sürümü lockfile ile pinli; migration sahibi Drizzle Kit (resmi
  adapter akışıyla uyumlu).

## 10. Kapatılacak / Güncellenecek İşler

- **Kapat (stale, Supabase'e bağlı):** API Step 6 milestone "Local Supabase and Storage"
  ve issue'ları (#32, #33, #34, #35, #36, #37, #38); App Roadmap 0017 (#30) ve avatar/
  local-supabase issue'ları (#31, #32, #33, #34). Avatar/storage gerçekten gerekirse
  Supabase-bağımsız (S3-uyumlu / object storage) yeni issue olarak açılır.
- **Güncelle:** api `technical-decisions.md` §3/§4/§5 (Supabase auth/JWT → Better Auth),
  `technical-infrastructure.md` §8.4/§8.5/§8.6 (Supabase DB client/project/auth config →
  Postgres/Better Auth) ve §1.1 (Supabase JWT middleware ifadesi).
- **Yeni milestone/issue:** API-1, APP-1 ve hardening (audit DB-role) issue'ları.
```
