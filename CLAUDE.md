# my-dream-api — Claude guidance

Living guide for this repo: system overview, conventions, coverage gate and docs
references. Keep it current — when a non-obvious project rule, quirk or pattern
is learned, add it here.

## Project system

- **Stack:** Bun + Hono, Drizzle ORM, PostgreSQL 16, Redis, zod 4, Vitest (v8
  coverage). Local Postgres/Redis via Docker Compose.
- **Layout:** `src/features/<feature>/` — `*.controller.ts` (Hono routes),
  `*.service.ts` (logic), `*.schema.ts` (Drizzle table), `*.schemas.ts` (zod
  request/response), plus `*.processor.ts`/`*.provider.ts` where relevant.
  `src/middlewares` (authMiddleware, errorHandler, rateLimitMiddleware,
  idempotency, requestLogger), `src/errors` (`AppError` subclasses),
  `src/config` (`env.ts` zod validation via `parseRuntimeEnv`, `index.ts`),
  `src/services` (`redis.ts`, `cache.ts`), `src/db` (schema, enums, seed,
  migrator). Tests under `tests/` (`features/`, `routes/` contract, `unit/`).
- **Commands:** `bun run lint`, `bun run test`, `bun run test:coverage`,
  `bun run build`, `bun run docker:up`, `bun run db:migrate`, `bun run db:seed`.

## Coverage gate (must stay 100%)

`vitest.config.ts` `coverage.include[]` is a **curated** list (services,
middlewares, key utils, errors, etc.) held at 100% statements/branches/functions/
lines. Only listed files are gated — when you add a gated module, add full tests.

## Conventions / patterns (learned)

- **Error envelope:** `errorHandler` returns `{ success:false, error:{ code,
  message } }` from `AppError` subclasses (`RateLimitError` → 429 `RATE_LIMITED`,
  `NotFoundError`, `ForbiddenError`, `ValidationError`, `CreditError`, …).
  Success: `{ success:true, data }`.
- **No silent fallbacks** in critical paths — critical deps (e.g. Redis for rate
  limiting) are mandatory and must fail loud (`5xx`), not silently degrade.
  Config comes from env, zod-**required** (no hardcoded constants). See workspace
  `AGENTS.md` ("Fallback ve Kritik Bagimlilik Politikasi") and the hardening
  issue `mertparlak-zima/my-dream-api#65`.
- **Rate limiting:** currently global `app.use('*', createRateLimitMiddleware())`,
  Redis sliding-window with an in-memory fallback; client key `local-dev` in dev.
  Being hardened per #65 (Redis-only, env+zod config, env-aware keying).
- **Auth (Better Auth, Step 7):** identity is owned by Better Auth (mounted at
  `/api/auth/*`); `authMiddleware` resolves the user via `auth.api.getSession`
  (cookie/header) — no JWT/JWKS. Tables `users`/`accounts`/`sessions`/
  `verifications` (UUID, plural) are Better Auth's; app FKs point to `users.id`.
  Domain state is decomposed: `user_entitlements` (plan), `user_usage` (quota
  window), `user_wallets` (coin balance), immutable `credit_transactions` ledger,
  `entitlement_history`, lightweight `audit_logs`. `ensureUserDomainState` lazily
  provisions the 1:1 rows inside the mutation tx. Local dev: `DEV_AUTH_ENABLED=true`
  + `X-Dev-User-Id` (seeded dev user `00000000-0000-4000-8000-000000000001`);
  dev/test also enable email/password. Auth-required routes 401 without it;
  `/interpreters` is public. Spec: `docs/specs/2026-06-21-better-auth-postgres-migration.md`.
- **Migrations quirk:** `drizzle-kit migrate` can fail opaquely on local. Use the
  ORM migrator (`drizzle-orm/postgres-js/migrator`) via a one-off script when
  `drizzle-kit migrate` exits non-zero. Reference/dummy data ships to prod via
  migration `INSERT/UPDATE`, not seed.
- **Live verification:** before committing contract changes, curl the real
  endpoint and confirm schema/enum/status — not just unit tests.

## Technical / decision docs

`React/project-docs/my-dream/my-dream-api/`: `technical-decisions.md`,
`technical-infrastructure.md`, `file-structure.md`. Infra notes:
`React/project-docs/infra/hetzner-coolify/README.md`. Issue tracking: GitHub
`mertparlak-zima/my-dream-api`.
