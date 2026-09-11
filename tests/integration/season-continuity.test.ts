import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { main as seedReferenceData } from "../../prisma/seed";
import { createAdminClient } from "../../src/server/db/client";
import { withTenant } from "../../src/server/db/tenant-client";
import { createLeague } from "../../src/server/domain/leagues/create-league";
import { joinLeague } from "../../src/server/domain/leagues/join-league";
import { startSeason } from "../../src/server/domain/leagues/start-season";
import { closeSeason } from "../../src/server/domain/leagues/close-season";
import { LeagueError } from "../../src/server/domain/leagues/join-league";
import { startDraft } from "../../src/server/domain/drafts/start-draft";
import { submitDraftPick } from "../../src/server/domain/drafts/submit-pick";

/**
 * SRD Epic D: multi-cycle continuity. A keeper league should carry every
 * returning owner's blocs into the next season automatically (Phase 1's
 * keep-all simplification — see start-season.ts), the following draft
 * should only need to fill the remaining roster slots, and historical
 * standings should stay reachable through the closed season.
 */

const admin = createAdminClient();

let tenant: { id: string };
let adminUser: { id: string };
let owner1: { id: string };
let owner2: { id: string };

beforeAll(async () => {
  await seedReferenceData();
  const suffix = randomUUID().slice(0, 8);
  tenant = await admin.tenant.create({ data: { slug: `continuity-test-${suffix}`, name: "Continuity Test" } });
  [adminUser, owner1, owner2] = await Promise.all(
    ["admin", "owner1", "owner2"].map((key) =>
      admin.user.create({ data: { email: `continuity-${key}-${suffix}@example.com`, name: key } })
    )
  );
});

afterAll(async () => {
  await admin.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
  await Promise.all([adminUser, owner1, owner2].map((u) => admin.user.delete({ where: { id: u.id } }).catch(() => {})));
  await admin.$disconnect();
});

describe("season continuity (redraft/keeper)", () => {
  it("a keeper league carries blocs into a new season and only drafts the remaining slots", async () => {
    const league = await createLeague(tenant.id, adminUser.id, {
      name: "Keeper League",
      rosterSize: 1,
      redraftPolicy: "keeper",
    });
    await joinLeague(tenant.id, league.id, owner1.id);
    await joinLeague(tenant.id, league.id, owner2.id);

    // --- Season 1: full draft. Every league member gets a roster,
    // including the admin (see start-season.ts) — 3 members x 1-bloc
    // rosters = 3 picks. ---
    const season1 = await startSeason(tenant.id, league.id, {
      electionCycle: "2026",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    const draft1 = await startDraft(tenant.id, season1.id);
    const order1 = draft1.pickOrder as string[];
    expect(order1).toHaveLength(3);

    const freeBlocs = await admin.bloc.findMany({
      where: { taxonomyId: league.blocTaxonomyId, isPaidTier: false },
      orderBy: { draftRank: "asc" },
    });
    expect(freeBlocs.length).toBeGreaterThanOrEqual(3);

    for (let i = 0; i < 3; i++) {
      await submitDraftPick(tenant.id, order1[i], draft1.id, freeBlocs[i].id);
    }

    const season1Rosters = await withTenant(tenant.id, (tx) =>
      tx.roster.findMany({ where: { seasonId: season1.id }, include: { rosterBlocs: true } })
    );
    for (const r of season1Rosters) {
      expect(r.rosterBlocs).toHaveLength(1);
    }

    // --- Close season 1, start season 2: keeper should pre-populate rosters ---
    await closeSeason(tenant.id, season1.id, adminUser.id);

    const season2 = await startSeason(tenant.id, league.id, {
      electionCycle: "2028",
      startDate: "2028-01-01",
      endDate: "2028-12-31",
    });

    const season2RostersBeforeDraft = await withTenant(tenant.id, (tx) =>
      tx.roster.findMany({ where: { seasonId: season2.id }, include: { rosterBlocs: true } })
    );
    for (const r of season2RostersBeforeDraft) {
      // Kept blocs carried over, with no draftPickId (never drafted this cycle).
      expect(r.rosterBlocs).toHaveLength(1);
      expect(r.rosterBlocs.every((rb) => rb.draftPickId === null)).toBe(true);
    }

    // Roster is already full (1/1 kept) — starting a draft with rosterSize
    // unchanged at 1 should need ZERO new picks and complete immediately.
    const draft2 = await startDraft(tenant.id, season2.id);
    expect(draft2.status).toBe("complete");
    expect(draft2.currentPickerUserId).toBeNull();

    const season2Final = await withTenant(tenant.id, (tx) => tx.season.findUniqueOrThrow({ where: { id: season2.id } }));
    expect(season2Final.status).toBe("active");
  });

  it("a full_redraft league starts every new season with empty rosters", async () => {
    const league = await createLeague(tenant.id, adminUser.id, {
      name: "Full Redraft League",
      rosterSize: 1,
      redraftPolicy: "full_redraft",
    });
    await joinLeague(tenant.id, league.id, owner1.id);

    const season1 = await startSeason(tenant.id, league.id, {
      electionCycle: "2026",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    const draft1 = await startDraft(tenant.id, season1.id);
    // Admin + owner1 both get a roster now — draft both picks (in
    // whatever turn order got shuffled) so the season actually completes
    // and can be closed.
    const order1 = draft1.pickOrder as string[];
    expect(order1).toHaveLength(2);
    const blocs = await admin.bloc.findMany({
      where: { taxonomyId: league.blocTaxonomyId, isPaidTier: false },
      take: 2,
    });
    await submitDraftPick(tenant.id, order1[0], draft1.id, blocs[0].id);
    await submitDraftPick(tenant.id, order1[1], draft1.id, blocs[1].id);
    await closeSeason(tenant.id, season1.id, adminUser.id);

    const season2 = await startSeason(tenant.id, league.id, {
      electionCycle: "2028",
      startDate: "2028-01-01",
      endDate: "2028-12-31",
    });
    const season2Roster = await withTenant(tenant.id, (tx) =>
      tx.roster.findFirstOrThrow({ where: { seasonId: season2.id, ownerUserId: owner1.id }, include: { rosterBlocs: true } })
    );
    expect(season2Roster.rosterBlocs).toHaveLength(0);
  });

  it("closing a season that is not active is rejected", async () => {
    const league = await createLeague(tenant.id, adminUser.id, { name: "Not Yet Active League", rosterSize: 1 });
    await joinLeague(tenant.id, league.id, owner1.id);
    const season = await startSeason(tenant.id, league.id, {
      electionCycle: "2026",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    // Still pre_draft — never started a draft.
    await expect(closeSeason(tenant.id, season.id)).rejects.toThrow(LeagueError);
  });
});
