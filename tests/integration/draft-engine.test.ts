import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { main as seedReferenceData } from "../../prisma/seed";
import { createAdminClient } from "../../src/server/db/client";
import { withTenant } from "../../src/server/db/tenant-client";
import { createLeague } from "../../src/server/domain/leagues/create-league";
import { joinLeague } from "../../src/server/domain/leagues/join-league";
import { startSeason } from "../../src/server/domain/leagues/start-season";
import { startDraft } from "../../src/server/domain/drafts/start-draft";
import { submitDraftPick } from "../../src/server/domain/drafts/submit-pick";
import { getDraftState } from "../../src/server/domain/drafts/get-draft-state";
import { DraftError } from "../../src/server/domain/drafts/errors";

/**
 * Exercises the full async draft flow end to end — the "manual draft flow"
 * verification the architecture plan calls for (§9), automated: league
 * creation with defaults, season start, draft start with the scarcity
 * check, picks in turn order, entitlement gating on a paid bloc, a wrong-
 * turn rejection, and an auto-pick after a simulated expired deadline.
 */

const admin = createAdminClient();

let tenant: { id: string };
let admin1: { id: string }; // league admin — also gets a roster (admin is a permission, not a separate non-playing role)
let owner1: { id: string };
let owner2: { id: string };
let owner3: { id: string };

beforeAll(async () => {
  await seedReferenceData();
  const suffix = randomUUID().slice(0, 8);
  tenant = await admin.tenant.create({ data: { slug: `draft-test-${suffix}`, name: "Draft Test Tenant" } });
  [admin1, owner1, owner2, owner3] = await Promise.all(
    ["admin1", "owner1", "owner2", "owner3"].map((key) =>
      admin.user.create({ data: { email: `draft-test-${key}-${suffix}@example.com`, name: key } })
    )
  );
});

afterAll(async () => {
  await admin.tenant.delete({ where: { id: tenant.id } }).catch(() => {});
  await Promise.all(
    [admin1, owner1, owner2, owner3].map((u) => admin.user.delete({ where: { id: u.id } }).catch(() => {}))
  );
  await admin.$disconnect();
});

describe("async draft engine", () => {
  it("runs a full draft: create league, join, start season, start draft, pick in turn order to completion", async () => {
    const league = await createLeague(tenant.id, admin1.id, { name: "Full Flow League", rosterSize: 1 });
    await joinLeague(tenant.id, league.id, owner1.id);
    await joinLeague(tenant.id, league.id, owner2.id);
    await joinLeague(tenant.id, league.id, owner3.id);

    const season = await startSeason(tenant.id, league.id, {
      electionCycle: "2026",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });

    const draftEvent = await startDraft(tenant.id, season.id);
    expect(draftEvent.status).toBe("in_progress");
    const pickOrder = draftEvent.pickOrder as string[];
    // admin1 + owner1 + owner2 + owner3 — every league member gets a
    // roster, admin included (see start-season.ts).
    expect(pickOrder).toHaveLength(4);

    // Free taxonomy has 5 seeded blocs; find 4 unclaimed free-tier ones to draft.
    const freeBlocs = await admin.bloc.findMany({
      where: { taxonomyId: league.blocTaxonomyId, isPaidTier: false },
      orderBy: { draftRank: "asc" },
    });
    expect(freeBlocs.length).toBeGreaterThanOrEqual(4);

    for (let i = 0; i < 4; i++) {
      const currentUserId = pickOrder[i];
      const pick = await submitDraftPick(tenant.id, currentUserId, draftEvent.id, freeBlocs[i].id);
      expect(pick.ownerUserId).toBe(currentUserId);
      expect(pick.pickNumber).toBe(i + 1);
    }

    const finalState = await getDraftState(tenant.id, draftEvent.id);
    expect(finalState.status).toBe("complete");
    expect(finalState.picks).toHaveLength(4);

    const finishedSeason = await withTenant(tenant.id, (tx) => tx.season.findUniqueOrThrow({ where: { id: season.id } }));
    expect(finishedSeason.status).toBe("active");
  });

  it("rejects a pick submitted out of turn", async () => {
    const league = await createLeague(tenant.id, admin1.id, { name: "Turn Order League", rosterSize: 1 });
    await joinLeague(tenant.id, league.id, owner1.id);
    await joinLeague(tenant.id, league.id, owner2.id);
    const season = await startSeason(tenant.id, league.id, {
      electionCycle: "2026",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    const draftEvent = await startDraft(tenant.id, season.id);
    const pickOrder = draftEvent.pickOrder as string[];
    // admin1 + owner1 + owner2 all get a roster now — pick whichever
    // isn't first, regardless of shuffle order.
    const outOfTurnUserId = [admin1.id, owner1.id, owner2.id].find((id) => id !== pickOrder[0])!;

    const bloc = await admin.bloc.findFirstOrThrow({ where: { taxonomyId: league.blocTaxonomyId, isPaidTier: false } });
    await expect(submitDraftPick(tenant.id, outOfTurnUserId, draftEvent.id, bloc.id)).rejects.toThrow(DraftError);
  });

  it("rejects a free-tier owner drafting a paid-tier bloc", async () => {
    const paidTaxonomy = await admin.blocTaxonomy.findFirstOrThrow({ where: { tenantId: null, tierRequired: "paid" } });
    const league = await createLeague(tenant.id, admin1.id, {
      name: "Paid Taxonomy League",
      rosterSize: 1,
      blocTaxonomyId: paidTaxonomy.id,
    });
    await joinLeague(tenant.id, league.id, owner1.id);
    const season = await startSeason(tenant.id, league.id, {
      electionCycle: "2026",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    const draftEvent = await startDraft(tenant.id, season.id);

    // admin1 + owner1 both get a roster now; submit as whoever is
    // actually first so this only exercises the entitlement rejection,
    // not a turn-order rejection.
    const firstPickerUserId = (draftEvent.pickOrder as string[])[0];
    const paidBloc = await admin.bloc.findFirstOrThrow({ where: { taxonomyId: paidTaxonomy.id, isPaidTier: true } });
    await expect(submitDraftPick(tenant.id, firstPickerUserId, draftEvent.id, paidBloc.id)).rejects.toThrow();
  });

  it("rejects starting a draft when rosterSize x ownerCount exceeds available blocs", async () => {
    const league = await createLeague(tenant.id, admin1.id, { name: "Too Big League", rosterSize: 10 });
    await joinLeague(tenant.id, league.id, owner1.id);
    const season = await startSeason(tenant.id, league.id, {
      electionCycle: "2026",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    // Free taxonomy only has 5 blocs; rosterSize 10 x 1 owner = 10 needed.
    await expect(startDraft(tenant.id, season.id)).rejects.toThrow(DraftError);
  });

  it("auto-picks a bloc once a pick's deadline has passed, without a background worker", async () => {
    const league = await createLeague(tenant.id, admin1.id, { name: "Auto Pick League", rosterSize: 1 });
    await joinLeague(tenant.id, league.id, owner1.id);
    await joinLeague(tenant.id, league.id, owner2.id);
    const season = await startSeason(tenant.id, league.id, {
      electionCycle: "2026",
      startDate: "2026-01-01",
      endDate: "2026-12-31",
    });
    const draftEvent = await startDraft(tenant.id, season.id);

    // Simulate time passing: force the deadline into the past, as if the
    // pick-time-limit clock had run out — no sleep needed.
    await withTenant(tenant.id, (tx) =>
      tx.draftEvent.update({ where: { id: draftEvent.id }, data: { currentPickDeadlineAt: new Date(Date.now() - 1000) } })
    );

    // No submitDraftPick call at all — getDraftState alone must resolve it
    // lazily (SRD B2's fallback, exercised the way get-draft-state.ts
    // actually uses it, not by calling resolveExpiredPicks directly).
    const state = await getDraftState(tenant.id, draftEvent.id);
    expect(state.picks).toHaveLength(1);
    expect(state.picks[0].isAutoPick).toBe(true);
    // Best-available = lowest draftRank; all seeded blocs share draftRank
    // 0, so this just confirms SOME eligible free-tier bloc was picked.
    expect(state.picks[0].bloc.isPaidTier).toBe(false);
  });
});
