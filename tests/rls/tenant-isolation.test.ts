import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAdminClient, prisma } from "../../src/server/db/client";
import { withTenant } from "../../src/server/db/tenant-client";

/**
 * Proves the RLS isolation described in prisma/rls/003_policies.sql and
 * consumed via src/server/db/tenant-client.ts actually holds — this is the
 * single highest-risk correctness point in the build (see the architecture
 * plan, §9 "Critical files"). Deliberately uses the app_runtime role (via
 * withTenant, the same helper the app uses) rather than the admin/bypass
 * role for every assertion — testing against a BYPASSRLS connection would
 * prove nothing.
 */

const admin = createAdminClient();

let tenantA: { id: string };
let tenantB: { id: string };
let user: { id: string };
let taxonomy: { id: string };
let scoringConfig: { id: string };
let leagueA: { id: string };
let leagueB: { id: string };

beforeAll(async () => {
  const suffix = randomUUID().slice(0, 8);

  tenantA = await admin.tenant.create({
    data: { slug: `rls-test-a-${suffix}`, name: "RLS Test Tenant A" },
  });
  tenantB = await admin.tenant.create({
    data: { slug: `rls-test-b-${suffix}`, name: "RLS Test Tenant B" },
  });

  user = await admin.user.create({
    data: { email: `rls-test-${suffix}@example.com`, name: "RLS Test User" },
  });

  taxonomy = await admin.blocTaxonomy.create({
    data: { tenantId: null, name: `RLS Test Taxonomy ${suffix}` },
  });
  scoringConfig = await admin.scoringConfig.create({
    data: { tenantId: null },
  });

  leagueA = await admin.league.create({
    data: {
      tenantId: tenantA.id,
      name: "League A",
      adminUserId: user.id,
      blocTaxonomyId: taxonomy.id,
      scoringConfigId: scoringConfig.id,
    },
  });
  leagueB = await admin.league.create({
    data: {
      tenantId: tenantB.id,
      name: "League B",
      adminUserId: user.id,
      blocTaxonomyId: taxonomy.id,
      scoringConfigId: scoringConfig.id,
    },
  });
});

afterAll(async () => {
  // Admin/bypass client cleanup — order matters for FKs.
  await admin.league.deleteMany({ where: { id: { in: [leagueA.id, leagueB.id] } } });
  await admin.scoringConfig.delete({ where: { id: scoringConfig.id } });
  await admin.blocTaxonomy.delete({ where: { id: taxonomy.id } });
  await admin.user.delete({ where: { id: user.id } });
  await admin.tenant.deleteMany({ where: { id: { in: [tenantA.id, tenantB.id] } } });
  await admin.$disconnect();
});

describe("tenant RLS isolation", () => {
  it("a SELECT scoped to tenant A cannot see tenant B's league", async () => {
    const visible = await withTenant(tenantA.id, (tx) =>
      tx.league.findMany({ where: { id: { in: [leagueA.id, leagueB.id] } } })
    );
    expect(visible.map((l) => l.id)).toEqual([leagueA.id]);
  });

  it("a SELECT scoped to tenant A cannot see tenant B's league even by direct id lookup", async () => {
    const row = await withTenant(tenantA.id, (tx) =>
      tx.league.findUnique({ where: { id: leagueB.id } })
    );
    expect(row).toBeNull();
  });

  it("a raw SQL SELECT scoped to tenant A returns zero rows for tenant B's league", async () => {
    const rows = await withTenant(tenantA.id, (tx) =>
      tx.$queryRaw<{ id: string }[]>`SELECT id FROM leagues WHERE id = ${leagueB.id}::uuid`
    );
    expect(rows).toHaveLength(0);
  });

  it("an UPDATE scoped to tenant A affects zero rows on tenant B's league", async () => {
    const result = await withTenant(tenantA.id, (tx) =>
      tx.league.updateMany({
        where: { id: leagueB.id },
        data: { name: "hacked-by-tenant-a" },
      })
    );
    expect(result.count).toBe(0);

    // Confirm via the admin (bypass) client that the row is genuinely unchanged.
    const untouched = await admin.league.findUniqueOrThrow({ where: { id: leagueB.id } });
    expect(untouched.name).toBe("League B");
  });

  it("a DELETE scoped to tenant A affects zero rows on tenant B's league", async () => {
    const result = await withTenant(tenantA.id, (tx) =>
      tx.league.deleteMany({ where: { id: leagueB.id } })
    );
    expect(result.count).toBe(0);

    const stillThere = await admin.league.findUnique({ where: { id: leagueB.id } });
    expect(stillThere).not.toBeNull();
  });

  it("a connection with no tenant context set sees zero rows, even after a prior withTenant call reused the connection (fail-closed)", async () => {
    // Deliberately queries via the runtime (app_runtime-role) client with
    // no set_config call in this call. This runs after several withTenant()
    // calls above, which is the important case: on a reused connection,
    // Postgres's current_setting() for a custom GUC returns '' (not NULL)
    // once that GUC name has ever been SET LOCAL on the connection — and
    // ''::uuid throws instead of failing closed unless guarded. See
    // prisma/rls/003_policies.sql's app_current_tenant_id() for the fix;
    // this test is what caught the bug in the first place.
    const rowsA = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM leagues WHERE id = ${leagueA.id}::uuid
    `;
    const rowsB = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM leagues WHERE id = ${leagueB.id}::uuid
    `;
    expect(rowsA).toHaveLength(0);
    expect(rowsB).toHaveLength(0);
  });
});
