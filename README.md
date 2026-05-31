# My Dream API

## Local Development

Install dependencies:

```sh
bun install
```

Start API and local Postgres with Docker:

```sh
bun run docker:up
```

Apply migrations and seed local data:

```sh
bun run db:migrate
bun run db:seed:local
```

Open:

```text
http://localhost:3000
```

Health check:

```sh
curl http://localhost:3000/health
```

API documentation:

```text
http://localhost:3000/docs
http://localhost:3000/openapi.json
```

## Local Database

Docker Compose starts a dedicated local Postgres database for this project.

| Field | Value |
| :--- | :--- |
| Host from local machine | `localhost` |
| Host from API container | `mydream-db` |
| Host port | `5433` |
| Container port | `5432` |
| Database | `mydream` |
| Username | `mydream` |
| Password | `mydream` |

Use this connection string from the host machine:

```env
DATABASE_URL=postgres://mydream:mydream@localhost:5433/mydream
```

For Supabase production, `DATABASE_URL` can use the Supabase Transaction pooler or direct Postgres URL. The API initializes `postgres-js` with `prepare: false`, because prepared statements are not supported in Supabase Transaction pool mode.

The API container uses this internal Docker connection string:

```env
DATABASE_URL=postgres://mydream:mydream@mydream-db:5432/mydream
```

Drizzle tracks applied migrations in:

```text
drizzle.__drizzle_migrations
```

## Dev Auth Bypass

Local Docker runs with `NODE_ENV=development` and `DEV_AUTH_ENABLED=true`.
Protected endpoints can be tested with the seeded dev user:

```text
00000000-0000-4000-8000-000000000001
```

Example:

```sh
curl -H "X-Dev-User-Id: 00000000-0000-4000-8000-000000000001" \
  http://localhost:3000/users/me
```

Production does not accept `X-Dev-User-Id`; use `Authorization: Bearer <supabase_jwt>`.

## Mock Policy

- `X-Dev-User-Id` is development/test only and must fail closed in production.
- Mock processors and fixtures do not belong in production runtime paths.
- Production requires real auth config and real external-service config instead of mock fallbacks.
- Canonical inventory and allowlist/denylist: [`../../../project-docs/my-dream/my-dream-api/technical-infrastructure.md`](../../../project-docs/my-dream/my-dream-api/technical-infrastructure.md).

## Dream Processing

`POST /dreams` creates a `PENDING` dream, spends credit, returns `202`, and schedules background AI processing. Production processing uses the `DreamInterpretationProvider` boundary with OpenRouter chat completions. Tests inject deterministic providers for success/failure; production content tags are not used for failure simulation.

OpenRouter uses the selected interpreter `system_prompt`, the linked model `openrouter_model_id`, timeout/retry settings from config, and sanitizes provider output before storing the interpretation. Provider failure marks the dream `FAILED` and preserves credit refund behavior.

Local seed uses the code-owned smoke model, `baidu/cobuddy:free`, and links the canonical interpreter rows to that model. The model id/name are not env values; changing the canonical smoke model should be a code/docs change.

## Production Env Contract

Production startup validates required env before serving traffic. The single source of truth is the Zod schema in `src/config/env.ts`; invalid or missing production values fail startup with field-level errors.

- `DATABASE_URL`
- `SUPABASE_URL`
- `OPENROUTER_API_KEY`
- `CORS_ALLOWED_ORIGINS` with explicit origins, never `*`
- `JWT_SECRET` for legacy HS256 verification or Supabase JWKS config derived from `SUPABASE_URL`

`DEV_AUTH_ENABLED=true` is rejected in production. Supabase JWKS can be overridden with `SUPABASE_JWKS_URL`; issuer can be overridden with `SUPABASE_JWT_ISSUER`.

Rate limit window and max request values are code-owned constants in `src/config/index.ts` for now. Current values are 120 requests per 60 seconds.

## Sentry

This Bun + Hono API uses `@sentry/bun`. Sentry initializes only when `SENTRY_DSN` is set, so local development and tests keep working with an empty DSN.

```env
SENTRY_DSN=<api-sentry-dsn>
SENTRY_ENVIRONMENT=production
SENTRY_RELEASE=my-dream-api@<git-sha-or-version>
SENTRY_TRACES_SAMPLE_RATE=0.1
```

`SENTRY_ENVIRONMENT` defaults to `NODE_ENV`. `SENTRY_TRACES_SAMPLE_RATE` accepts `0` through `1` and defaults to `1` outside production and `0.1` in production.

Unexpected errors from the global Hono error handler are captured. Expected `AppError` responses and Zod validation errors are not captured by default. Captured events tag the HTTP method/path and authenticated user id when available; email is not sent.

The Sentry scrubber redacts authorization headers, cookies, tokens, provider/API keys, DSNs, dream content, interpretations, feedback text, prompts, and provider messages before sending events. Keep request bodies and generated dream text out of manual Sentry extras.

Development/test verification endpoint:

```sh
curl http://localhost:3000/debug-sentry
```

The endpoint is not registered when `NODE_ENV=production`. For production smoke testing, trigger a controlled non-`AppError` failure through an internal-only path or temporary deployment check, then remove it.

TypeScript source maps are emitted by `tsconfig.json`, but Bun build output source maps are not uploaded here. Upload release source maps in CI with the Sentry CLI if stack traces need original TypeScript source context.

## Seed Safety

Seed commands require an explicit mode:

```sh
bun run db:seed:local
```

Local seed creates the canonical `baidu/cobuddy:free` model/interpreters plus the local dev user. Seeding is disabled when `NODE_ENV=production`; production data must not be bootstrapped from this repository. The local model id/name are code-owned seed defaults, not env configuration.

Real-network OpenRouter smoke is manual for now, not part of `bun run test`. With `OPENROUTER_API_KEY` set, run migration + seed, submit a dream through the normal API/app flow, then poll the dream until it reaches `COMPLETED` with a non-empty interpretation or `FAILED` with the credit refund preserved.

Production deploys should run committed migrations with `bun run db:migrate`. Do not use `db:push` for production schema changes.

## Production Database Migrations

Supabase production project:

| Field | Value |
| :--- | :--- |
| Project name | `my-dream-api` |
| Project ref | `dyzhdqcurixsysirthkn` |
| Region | `eu-west-1` |
| Postgres | `17.6` |

The GitHub workflow `.github/workflows/production-db-migrate.yml` runs on pushes to `main` when committed Drizzle migration files change. It installs dependencies, runs `bun run check`, and applies pending migrations with `bun run db:migrate`.

Required GitHub configuration:

- Environment: `production`
- Secret: `PRODUCTION_DATABASE_URL`

Use the Supabase production Postgres connection string for `PRODUCTION_DATABASE_URL`. Prefer a direct or session-mode connection for migrations when available, include SSL requirements from Supabase, and do not use this secret in app/client code. Runtime `DATABASE_URL` may use the Supabase Transaction pooler because prepared statements are disabled in the API DB client.

Rules:

- Remote schema changes go through committed files under `drizzle/`.
- Do not run SQL manually in the Supabase SQL editor for app schema changes.
- Do not run production seed from this repository.
- `db:push` remains local development tooling only; production uses committed migrations.

## Supabase Auth Provider Config

Supabase cloud auth config is managed from `supabase/config.toml` and can be pushed with:

```sh
supabase config push --project-ref dyzhdqcurixsysirthkn
```

Apple auth is enabled first for the Expo/iOS pilot. The initial native Client ID is:

```text
com.zimbabweblue.my-dream-app
```

For Expo Go smoke testing from a physical iPhone, point the app API base URL at `https://mydreamapi.zimastack.com` once DNS/TLS/deploy binding is live, and keep the native callback on `mydream://auth/callback`.

For Expo Go testing, `host.exp.Exponent` is also included in `supabase/config.toml`. For custom development builds, add every iOS bundle identifier that will call Supabase Apple auth.

The Apple provider secret is referenced as `env(SUPABASE_AUTH_EXTERNAL_APPLE_SECRET)` and must not be committed. Native-only Sign in with Apple via Expo `AppleAuthentication` and `signInWithIdToken` does not use the web OAuth Services ID secret. Leave `SUPABASE_AUTH_EXTERNAL_APPLE_SECRET` empty until an OAuth/browser fallback is needed. If Supabase CLI refuses to push Apple provider config without a secret, configure the native Client IDs in the dashboard first and defer CLI-managed Apple OAuth settings until the Services ID/secret exists.

Google auth is present but disabled in `supabase/config.toml`; enable it only after Google credentials are ready.

## Useful Commands

```sh
bun run check
bun run lint
bun run build
bun run test
bun run test:watch
bun run test:coverage
bun run db:generate
bun run db:migrate
bun run db:seed
```

## Tests

Copy `.env.test.example` into your local env setup and point `TEST_DATABASE_URL` at the local Postgres instance used for API tests.

The Vitest foundation includes reusable fixtures in `tests/helpers/fixtures.ts` and a cleanup helper that only removes rows created by tests.

DB-backed test files should call `setupDatabaseTestFile()` from `tests/helpers/lifecycle.ts`. Route tests can use `appRequest()` from `tests/helpers/app.ts`.

Run DB-backed Vitest commands sequentially because they share the configured local Postgres test database and cleanup markers.
