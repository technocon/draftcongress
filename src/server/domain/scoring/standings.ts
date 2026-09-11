import { prisma } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant-client";
import { categoryFor } from "./event-category";

export interface RosterStanding {
  rosterId: string;
  ownerUserId: string;
  score: number;
}

/**
 * Live-computed standings for a whole season (SRD C3: "not just at season
 * end"). Applies the league's own ScoringConfig legislative/electoral
 * weight to each ScoringEvent at READ time — see ingest.ts's doc comment
 * for why the weight (not custom per-rule point overrides) is what's
 * applied here rather than baked into ScoringEvent at ingestion.
 *
 * No denormalized Roster.cumulativeScore column is read/written — this
 * recomputes from ScoringEvent every call. Fine at Phase 1 scale; a
 * denormalization job can write that column later if read load requires it
 * (see the architecture plan §4).
 */
export async function computeSeasonStandings(seasonId: string, tenantId: string): Promise<RosterStanding[]> {
  const { rosters, weights } = await withTenant(tenantId, async (tx) => {
    const season = await tx.season.findUniqueOrThrow({
      where: { id: seasonId },
      include: {
        league: { include: { scoringConfig: true } },
        rosters: { include: { rosterBlocs: { select: { blocId: true } } } },
      },
    });
    return {
      rosters: season.rosters,
      weights: {
        legislative: season.league.scoringConfig.legislativeWeight,
        electoral: season.league.scoringConfig.electoralWeight,
      },
    };
  });

  const allBlocIds = Array.from(new Set(rosters.flatMap((r) => r.rosterBlocs.map((rb) => rb.blocId))));
  if (allBlocIds.length === 0) {
    return rosters.map((r) => ({ rosterId: r.id, ownerUserId: r.ownerUserId, score: 0 }));
  }

  // ScoringEvent is reference data (no RLS) — queried via the plain
  // runtime client, not the tenant-scoped transaction above.
  const events = await prisma.scoringEvent.findMany({
    where: { blocId: { in: allBlocIds } },
    select: { blocId: true, eventType: true, pointsAwarded: true },
  });

  const scoreByBloc = new Map<string, number>();
  for (const event of events) {
    const weight = categoryFor(event.eventType) === "legislative" ? weights.legislative : weights.electoral;
    scoreByBloc.set(event.blocId, (scoreByBloc.get(event.blocId) ?? 0) + event.pointsAwarded * weight);
  }

  return rosters
    .map((r) => ({
      rosterId: r.id,
      ownerUserId: r.ownerUserId,
      score: r.rosterBlocs.reduce((sum, rb) => sum + (scoreByBloc.get(rb.blocId) ?? 0), 0),
    }))
    .sort((a, b) => b.score - a.score);
}

export async function computeRosterScore(rosterId: string, tenantId: string): Promise<number> {
  const standings = await withTenant(tenantId, (tx) =>
    tx.roster.findUniqueOrThrow({ where: { id: rosterId }, select: { seasonId: true } })
  );
  const all = await computeSeasonStandings(standings.seasonId, tenantId);
  return all.find((s) => s.rosterId === rosterId)?.score ?? 0;
}
