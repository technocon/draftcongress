import { prisma } from "@/server/db/client";
import { computeHemicycleLayout } from "./hemicycle-layout";

// The Senate class up for regular election in the CURRENT cycle (2026) —
// see Race.senateClass in schema.prisma. Bump alongside every other
// "2026"-cycle constant in this codebase (prisma/seed.ts, the various
// scripts/import-*.ts CYCLE consts) when the app moves to a new cycle.
const CURRENT_SENATE_CLASS = 2;

export interface RaceDetail {
  id: string;
  seatLabel: string;
  cycle: string;
  party: string;
  rating: string;
  /** Real seat state (see prisma/seed.ts) — always present, independent of
   * whether an incumbent has been seeded/imported for this seat. */
  state: string;
  x: number;
  y: number;
  incumbent: {
    id: string;
    fullName: string;
    party: string;
    state: string;
    district: string | null;
    blocs: { id: string; name: string }[];
    recentScoringEvents: { eventType: string; pointsAwarded: number; occurredAt: string; source: string }[];
  } | null;
}

// Ideological/party ordering left→right in the arc — matches how real
// hemicycle charts read (one party's block on each side, independents in
// the middle), NOT seat-number order (seat numbers are arbitrary here).
const PARTY_ORDER: Record<string, number> = { D: 0, I: 1, R: 2 };
const RATING_ORDER: Record<string, number> = { safe: 0, likely: 1, lean: 2, toss_up: 3, likely_r: 1 };

/**
 * All races for a chamber/cycle, each pre-assigned an (x, y) hemicycle
 * layout position — the /congress dashboard's House/Senate arc chart
 * (SRD's "House and Senate breakdowns"). Seats are sorted by party then
 * by how competitive the race is (safest first) before being zipped with
 * layout points, so each party occupies a contiguous wedge of the arc
 * with the closer races naturally landing near the middle boundary —
 * the same visual convention real parliament/hemicycle charts use.
 */
/**
 * `upOnly`: ONLY pass true for the Senate chamber — every House row has
 * senateClass = null (not applicable), so filtering by
 * `senateClass: CURRENT_SENATE_CLASS` against House rows would zero out
 * the result entirely rather than being a harmless no-op. Callers are
 * responsible for this (see src/app/congress/page.tsx).
 */
export async function getChamberRaceMap(chamberId: string, cycle = "2026", upOnly = false): Promise<RaceDetail[]> {
  const races = await prisma.race.findMany({
    where: { chamberId, cycle, ...(upOnly ? { senateClass: CURRENT_SENATE_CLASS } : {}) },
    include: {
      incumbent: {
        include: {
          blocMemberships: {
            where: { OR: [{ endDate: null }, { endDate: { gte: new Date() } }] },
            include: { bloc: { select: { id: true, name: true } } },
          },
          scoringEvents: { orderBy: { occurredAt: "desc" }, take: 5 },
        },
      },
    },
  });

  const sorted = [...races].sort((a, b) => {
    const partyDelta = (PARTY_ORDER[a.party] ?? 1) - (PARTY_ORDER[b.party] ?? 1);
    if (partyDelta !== 0) return partyDelta;
    // Within a party: for the D side, competitive (toss_up) races belong
    // nearest the R side and vice versa, so both parties' toss-ups meet
    // in the middle of the arc — flip the rating order for R.
    const ratingDelta = (RATING_ORDER[a.rating] ?? 0) - (RATING_ORDER[b.rating] ?? 0);
    return a.party === "R" ? -ratingDelta : ratingDelta;
  });

  const points = computeHemicycleLayout(sorted.length);

  return sorted.map((r, i) => ({
    id: r.id,
    seatLabel: r.seatLabel,
    cycle: r.cycle,
    party: r.party,
    rating: r.rating,
    state: r.state,
    x: points[i]?.x ?? 0,
    y: points[i]?.y ?? 0,
    incumbent: r.incumbent
      ? {
          id: r.incumbent.id,
          fullName: r.incumbent.fullName,
          party: r.incumbent.party,
          state: r.incumbent.state,
          district: r.incumbent.district,
          blocs: r.incumbent.blocMemberships.map((m) => m.bloc),
          recentScoringEvents: r.incumbent.scoringEvents.map((e) => ({
            eventType: e.eventType,
            pointsAwarded: e.pointsAwarded,
            occurredAt: e.occurredAt.toISOString(),
            source: e.source,
          })),
        }
      : null,
  }));
}
