import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { main as seedReferenceData } from "../../prisma/seed";
import { createAdminClient, prisma } from "../../src/server/db/client";
import { withTenant } from "../../src/server/db/tenant-client";
import { runElectoralIngestion, runLegislativeIngestion } from "../../src/server/domain/scoring/ingest";
import { computeSeasonStandings } from "../../src/server/domain/scoring/standings";

/**
 * Verifies the fixture-adapter ingestion pipeline end to end (SRD Phase-One
 * DoD, §13: "see live standings update from real scoring events" — real in
 * the sense of flowing through the real ingestion code path, fixture-backed
 * per the architecture plan §4 since no API keys exist yet).
 */

const admin = createAdminClient();
const since = new Date("2026-01-01T00:00:00.000Z");

// Fixed seed bloc id for "House Freedom Caucus" — see prisma/seed.ts's
// deterministicId("bloc", "house-freedom"). Recomputed here rather than
// imported to keep this test decoupled from seed.ts's internals.
function deterministicId(namespace: string, key: string): string {
  const hex = Buffer.from(`${namespace}:${key}`).toString("hex").padEnd(32, "0").slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
const houseFreedomBlocId = deterministicId("bloc", "house-freedom");

let tenant: { id: string };
let user: { id: string };
let taxonomy: { id: string };
let scoringConfig: { id: string };
let league: { id: string };
let season: { id: string };
let roster: { id: string };

beforeAll(async () => {
  await seedReferenceData();

  const suffix = randomUUID().slice(0, 8);
  tenant = await admin.tenant.create({ data: { slug: `scoring-test-${suffix}`, name: "Scoring Test Tenant" } });
  user = await admin.user.create({ data: { email: `scoring-test-${suffix}@example.com`, name: "Scoring Test User" } });
  taxonomy = await admin.blocTaxonomy.findFirstOrThrow({ where: { tenantId: null } });
  scoringConfig = await admin.scoringConfig.findFirstOrThrow({ where: { tenantId: null } });

  league = await admin.league.create({
    data: {
      tenantId: tenant.id,
      name: "Scoring Test League",
      adminUserId: user.id,
      blocTaxonomyId: taxonomy.id,
      scoringConfigId: scoringConfig.id,
    },
  });
  season = await admin.season.create({
    data: {
      tenantId: tenant.id,
      leagueId: league.id,
      electionCycle: "2026",
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-12-31"),
    },
  });
  roster = await admin.roster.create({
    data: { tenantId: tenant.id, seasonId: season.id, ownerUserId: user.id },
  });
  await admin.rosterBloc.create({
    data: { tenantId: tenant.id, rosterId: roster.id, seasonId: season.id, blocId: houseFreedomBlocId },
  });
});

afterAll(async () => {
  await admin.rosterBloc.deleteMany({ where: { rosterId: roster.id } });
  await admin.roster.deleteMany({ where: { id: roster.id } });
  await admin.season.deleteMany({ where: { id: season.id } });
  await admin.league.deleteMany({ where: { id: league.id } });
  await admin.user.deleteMany({ where: { id: user.id } });
  await admin.tenant.deleteMany({ where: { id: tenant.id } });
  await admin.$disconnect();
});

describe("scoring ingestion pipeline", () => {
  it("ingests fixture legislative events into ScoringEvent, attributed to the right bloc", async () => {
    const results = await runLegislativeIngestion(since);
    expect(results.some((r) => r.error)).toBe(false);
    expect(results.some((r) => r.created > 0)).toBe(true);

    // ScoringEvent is global reference data (§2.1 of the architecture
    // plan) — it is NOT reset between test runs or scoped to this test, so
    // this asserts presence, not an exact set (electoral fixture events
    // for the same bloc/legislator legitimately coexist here too).
    const eventTypes = await prisma.scoringEvent
      .findMany({ where: { blocId: houseFreedomBlocId }, select: { eventType: true } })
      .then((rows) => rows.map((r) => r.eventType));
    expect(eventTypes).toEqual(
      expect.arrayContaining(["bill_sponsored", "bill_passed", "vote_cast"])
    );
  });

  it("ingesting the same fixture data twice does not create duplicate ScoringEvent rows", async () => {
    const before = await prisma.scoringEvent.count({ where: { blocId: houseFreedomBlocId } });
    await runLegislativeIngestion(since);
    const after = await prisma.scoringEvent.count({ where: { blocId: houseFreedomBlocId } });
    expect(after).toBe(before);
  });

  it("ingests fixture electoral events, including for a chamber with no legislative events yet", async () => {
    const results = await runElectoralIngestion(since);
    // fetchRaceResults on the fixture adapter never errors — only the real
    // FEC adapter's fetchRaceResults is intentionally unimplemented.
    expect(results.some((r) => r.error)).toBe(false);
  });

  it("computeSeasonStandings reflects ingested events through the league's scoring weights, without any season-end batch step", async () => {
    const standings = await computeSeasonStandings(season.id, tenant.id);
    const mine = standings.find((s) => s.rosterId === roster.id);
    expect(mine).toBeDefined();
    // Legislative: bill_sponsored(2) + bill_passed(5) + vote_cast(0.1), all * legislativeWeight(0.5) = 3.55
    // Electoral: re_election_won(10) * electoralWeight(0.5) = 5 (from the electoral-ingestion test above,
    // which also targets S000001/house-freedom — see fixtures/data/race-results.json)
    expect(mine!.score).toBeCloseTo(8.55, 5);
  });

  it("standings are only visible to their own tenant (RLS still holds for the season/league/roster chain)", async () => {
    const otherTenant = await admin.tenant.create({ data: { slug: `scoring-test-other-${randomUUID().slice(0, 8)}`, name: "Other" } });
    await expect(
      withTenant(otherTenant.id, (tx) => tx.season.findUniqueOrThrow({ where: { id: season.id } }))
    ).rejects.toThrow();
    await admin.tenant.delete({ where: { id: otherTenant.id } });
  });
});
