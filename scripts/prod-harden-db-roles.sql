-- Production DB-role hardening (Step 7 hardening).
--
-- Enforces append-only immutability for the ledger/history/audit tables at the
-- database level, not just in code. Run ONCE in production (and after adding new
-- tables) as the database owner / migration role, against a DEDICATED runtime
-- role that the API connects as — separate from the owner role used by
-- `drizzle-kit migrate`.
--
--   psql "$OWNER_DATABASE_URL" -v runtime_role=mydream_runtime -f scripts/prod-harden-db-roles.sql
--
-- Notes:
--   * Immutable tables get SELECT + INSERT only (no UPDATE / DELETE).
--   * user_wallets is mutable (balance changes) → SELECT + INSERT + UPDATE, no DELETE.
--   * ON DELETE SET NULL / CASCADE foreign-key actions are enforced by the RI
--     system regardless of the runtime role's table privileges, so account
--     deletion still anonymizes credit_transactions / entitlement_history /
--     audit_logs even though the runtime role cannot UPDATE/DELETE them directly.
--   * The runtime role must NOT own the tables (owners bypass these grants).

\set runtime_role :runtime_role

BEGIN;

-- Baseline: full DML on the application tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :runtime_role;

-- Immutable, append-only tables: lock down to SELECT + INSERT.
REVOKE UPDATE, DELETE ON
  credit_transactions,
  entitlement_history,
  audit_logs
FROM :runtime_role;

-- Mutable balance, but never hard-deleted by the runtime.
REVOKE DELETE ON user_wallets FROM :runtime_role;

COMMIT;
