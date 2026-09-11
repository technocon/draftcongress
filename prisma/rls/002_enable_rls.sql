-- Enable row level security on every tenant-scoped table. FORCE ROW LEVEL
-- SECURITY is applied too, so RLS holds even for a future table owner that
-- isn't app_migrator — app_runtime never owns these tables, but this is
-- defense in depth, not the primary control (the primary control is that
-- app_runtime has no BYPASSRLS and app_migrator is never used at request time).
--
-- Run after 001_roles.sql and after `prisma migrate deploy` has created the
-- tables (Prisma Migrate has no first-class RLS support, so this lives
-- outside the migration history as a plain SQL script — see README for the
-- exact run order).

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenant_memberships',
    'leagues',
    'league_memberships',
    'seasons',
    'rosters',
    'roster_blocs',
    'draft_events',
    'draft_picks',
    'tenant_entitlements',
    'audit_logs',
    'bloc_taxonomies',
    'scoring_configs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;

-- NOTE: `tenants` itself is intentionally NOT RLS-enabled in Phase 1 — with
-- a single public tenant this has no effect, and tenant-existence/branding
-- rows are lower-sensitivity than league/roster/user data. Revisit when a
-- second (white-label) tenant is provisioned: SRD §5.2 requires white-label
-- tenants have no cross-visibility, which may extend to hiding other
-- tenants' rows here too.
