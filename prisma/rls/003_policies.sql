-- Tenant isolation policies. The session variable app.current_tenant_id must
-- be set via `SET LOCAL` inside the same transaction as the query — see
-- src/server/db/tenant-client.ts.
--
-- app_current_tenant_id() wraps current_setting() with NULLIF(..., '') before
-- the ::uuid cast. This guards a real Postgres gotcha (caught by
-- tests/rls/tenant-isolation.test.ts): the FIRST time a custom GUC like
-- app.current_tenant_id is SET LOCAL on a connection, current_setting(...,
-- true) correctly returns NULL if it was never set. But once that custom
-- parameter name has been used at least once on a connection, later reads
-- on the SAME connection after the local scope ends return '' (empty
-- string), not NULL — and ''::uuid throws a hard error instead of failing
-- closed. Since Prisma (and any pooled/Neon-fronted connection) reuses
-- connections across requests, this isn't a hypothetical: it WILL happen
-- the first time a connection that has ever run a tenant-scoped query is
-- later used for an unscoped one. NULLIF converts '' to NULL before the
-- cast, so an unset tenant context reliably yields zero visible rows
-- (fail-closed) instead of a 500.
CREATE OR REPLACE FUNCTION app_current_tenant_id() RETURNS uuid AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
$$ LANGUAGE sql STABLE;

-- Standard tables: strict tenant match, no exceptions.
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
    'tenant_entitlements'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (tenant_id = app_current_tenant_id())
         WITH CHECK (tenant_id = app_current_tenant_id())',
      t
    );
  END LOOP;
END
$$;

-- audit_logs: tenant_id is nullable, but deliberately NOT given a
-- "tenant_id IS NULL" fallback clause. Platform-level audit entries
-- (tenant_id null — e.g. cross-tenant admin actions) are readable/writable
-- ONLY via the bypass-RLS platform client (app_migrator / a future
-- platform-admin role), never through a tenant-scoped app_runtime session.
-- A tenant-scoped session can read/write only its own tenant's entries.
CREATE POLICY tenant_isolation ON audit_logs
  USING (tenant_id = app_current_tenant_id())
  WITH CHECK (tenant_id = app_current_tenant_id());

-- bloc_taxonomies / scoring_configs: the documented nullable-tenant
-- exception. tenant_id = NULL rows are platform defaults, readable by every
-- tenant context. Writes to null-tenant rows are NOT blocked by RLS here —
-- RLS can't cleanly express "only a platform admin may write a null-tenant
-- row" — that check is enforced in the application layer
-- (src/server/domain/*), so treat this policy as read-isolation only for
-- the null case and rely on the app layer for the write-side platform-admin
-- check.
CREATE POLICY tenant_isolation ON bloc_taxonomies
  USING (
    tenant_id IS NULL
    OR tenant_id = app_current_tenant_id()
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = app_current_tenant_id()
  );

CREATE POLICY tenant_isolation ON scoring_configs
  USING (
    tenant_id IS NULL
    OR tenant_id = app_current_tenant_id()
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = app_current_tenant_id()
  );
