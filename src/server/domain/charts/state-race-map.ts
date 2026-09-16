import { prisma } from "@/server/db/client";

export interface StateSeatDetail {
  id: string;
  seatLabel: string;
  district: number | null;
  party: string;
  rating: string;
  incumbent: {
    id: string;
    fullName: string;
    party: string;
    blocs: { id: string; name: string }[];
    recentScoringEvents: { eventType: string; pointsAwarded: number; occurredAt: string; source: string }[];
  } | null;
}

export interface StateDelegation {
  house: StateSeatDetail[];
  senate: StateSeatDetail[];
}

/**
 * A single state's full congressional delegation — the data source for the
 * state district-map drill-down (src/app/congress/states/[code]/page.tsx),
 * reached from the state picker or from a race-arc-chart drill-down's
 * "View state's district map" link. House seats are real (state, district)
 * identity from HOUSE_SEATS_BY_STATE; Senate has no districts to
 * subdivide, so both of a state's seats are returned as a flat pair.
 */
export async function getStateDelegation(stateCode: string, cycle = "2026"): Promise<StateDelegation> {
  const races = await prisma.race.findMany({
    where: { state: stateCode, cycle },
    include: {
      chamber: { select: { name: true } },
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

  const toDetail = (r: (typeof races)[number]): StateSeatDetail => ({
    id: r.id,
    seatLabel: r.seatLabel,
    district: r.district,
    party: r.party,
    rating: r.rating,
    incumbent: r.incumbent
      ? {
          id: r.incumbent.id,
          fullName: r.incumbent.fullName,
          party: r.incumbent.party,
          blocs: r.incumbent.blocMemberships.map((m) => m.bloc),
          recentScoringEvents: r.incumbent.scoringEvents.map((e) => ({
            eventType: e.eventType,
            pointsAwarded: e.pointsAwarded,
            occurredAt: e.occurredAt.toISOString(),
            source: e.source,
          })),
        }
      : null,
  });

  const house = races
    .filter((r) => r.chamber.name === "U.S. House of Representatives")
    .sort((a, b) => (a.district ?? 0) - (b.district ?? 0))
    .map(toDetail);
  const senate = races
    .filter((r) => r.chamber.name === "U.S. Senate")
    .sort((a, b) => a.seatLabel.localeCompare(b.seatLabel))
    .map(toDetail);

  return { house, senate };
}
