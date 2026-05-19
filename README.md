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
bun run db:seed
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

## Production Env Contract

Production startup validates required env before serving traffic. The single source of truth is the Zod schema in `src/config/env.ts`; invalid or missing production values fail startup with field-level errors.

- `DATABASE_URL`
- `SUPABASE_URL`
- `OPENROUTER_API_KEY`
- `CORS_ALLOWED_ORIGINS` with explicit origins, never `*`
- `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS` as positive integers
- `JWT_SECRET` for legacy HS256 verification or Supabase JWKS config derived from `SUPABASE_URL`

`DEV_AUTH_ENABLED=true` is rejected in production. Supabase JWKS can be overridden with `SUPABASE_JWKS_URL`; issuer can be overridden with `SUPABASE_JWT_ISSUER`.

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
