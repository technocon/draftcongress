import { prisma } from "@/server/db/client";
import { withTenant } from "@/server/db/tenant-client";
import { categoryFor } from "@/server/domain/scoring/event-category";

export interface RacePoint {
  /** epoch ms — ECharts' `time` axis wants numbers/dates, not date strings. */
  t: number;
  cumulativeScore: number;
}

export interface RaceSeries {
  rosterId: string;
  ownerLabel: string;
  points: RacePoint[];
}

/**
 * Per-roster cumulative score over time — the fantasy "standings race"
 * chart. Same weight application as
 * src/server/domain/scoring/standings.ts's final totals; this just keeps
 * every intermediate step instead of only the final sum, so the chart can
 * draw the actual climb (or fall — seat_flip is a negative PLACEHOLDER
 * rule) for each roster.
 */
export async function computeStandingsRace(seasonId: string, tenantId: string): Promise<RaceSeries[]> {
  const { rosters, weights } = await withTenant(tenantId, async (tx) => {
    const season = await tx.season.findUniqueOrThrow({
      where: { id: seasonId },
      include: {
        league: { include: { scoringConfig: true } },
        rosters: {
          include: {
            owner: { select: { name: true, email: true } },
            rosterBlocs: { select: { blocId: true } },
          },
        },
      },
    });
    return {
      rosters: season.rosters,
      weights: { legislative: season.league.scoringConfig.legislativeWeight, electoral: season.league.scoringConfig.electoralWeight },
    };
  });

  const allBlocIds = Array.from(new Set(rosters.flatMap((r) => r.rosterBlocs.map((rb) => rb.blocId))));
  if (allBlocIds.length === 0) {
    return rosters.map((r) => ({ rosterId: r.id, ownerLabel: r.owner.name ?? r.owner.email ?? "Owner", points: [] }));
  }

  const events = await prisma.scoringEvent.findMany({
    where: { blocId: { in: allBlocIds } },
    select: { blocId: true, eventType: true, pointsAwarded: true, occurredAt: true },
    orderBy: { occurredAt: "asc" },
  });

  return rosters.map((roster) => {
    const rosterBlocIds = new Set(roster.rosterBlocs.map((rb) => rb.blocId));
    let running = 0;
    const points: RacePoint[] = [];
    for (const event of events) {
      if (!rosterBlocIds.has(event.blocId)) continue;
      const weight = categoryFor(event.eventType) === "legislative" ? weights.legislative : weights.electoral;
      running += event.pointsAwarded * weight;
      points.push({ t: event.occurredAt.getTime(), cumulativeScore: running });
    }
    return { rosterId: roster.id, ownerLabel: roster.owner.name ?? roster.owner.email ?? "Owner", points };
  });
}
