-- Two Postgres roles enforce the migrator/runtime split described in the
-- architecture plan (§2.3):
--   app_migrator — owns the schema, BYPASSRLS. Used ONLY by `prisma migrate`
--                  and `prisma/seed.ts`, via DIRECT_DATABASE_URL.
--   app_runtime  — used by the running app server. RLS fully enforced, no
--                  bypass, no elevated grants. Used via DATABASE_URL.
--
-- Run this once against a fresh database, as the database owner, before the
-- first `prisma migrate deploy`. Replace the passwords before running in any
-- shared environment — these are local-dev placeholders.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_migrator') THEN
    CREATE ROLE app_migrator WITH LOGIN PASSWORD 'change_me_migrator' BYPASSRLS;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime WITH LOGIN PASSWORD 'change_me_runtime' NOBYPASSRLS;
  END IF;
END
$$;

-- app_migrator needs to own/alter the schema.
GRANT ALL ON SCHEMA public TO app_migrator;

-- app_runtime needs ordinary CRUD, nothing more. RLS policies (003) are the
-- actual isolation boundary; these grants are the coarse "can touch tables
-- at all" layer underneath them.
GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;

-- Ensure tables created by future migrations are automatically grantable to
-- app_runtime without re-running this script.
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;
