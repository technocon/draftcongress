import { prisma } from "@/server/db/client";

// Keep in sync with race-map.ts's CURRENT_SENATE_CLASS — the Senate class
// up for regular election in the current (2026) cycle.
const CURRENT_SENATE_CLASS = 2;

export interface StateSeatDetail {
  id: string;
  seatLabel: string;
  district: number | null;
  party: string;
  rating: string;
  /** Winner's % of the vote in this seat's most recent logged general
   * election — real (MEDSL/Harvard Dataverse) once imported, both null
   * until then. House only — see the election-results adapter's comment. */
  lastElectionYear: number | null;
  lastElectionPct: number | null;
  /** Current-cycle campaign-finance snapshot from FEC/OpenFEC — the
   * leading (FEC-flagged incumbent, or top-fundraiser) candidate's
   * receipts/disbursements/cash-on-hand for the race in progress, NOT
   * necessarily the same person as `incumbent` below. All null until
   * scripts/import-campaign-finance.ts has been run. */
  financeCandidate: string | null;
  financeReceipts: number | null;
  financeDisbursements: number | null;
  financeCashOnHand: number | null;
  /** Senate only — whether this seat's class is up in the current (2026)
   * cycle (see Race.senateClass in schema.prisma). Always null for House
   * (every House seat is up every cycle, so the concept doesn't apply). */
  isUpThisCycle: boolean | null;
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
 *
 * `upOnly`: when true, drops Senate seats not up in the current cycle
 * (House is untouched — every House seat is up every cycle).
 */
export async function getStateDelegation(stateCode: string, cycle = "2026", upOnly = false): Promise<StateDelegation> {
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
    lastElectionYear: r.lastElectionYear,
    lastElectionPct: r.lastElectionPct,
    financeCandidate: r.financeCandidate,
    financeReceipts: r.financeReceipts,
    financeDisbursements: r.financeDisbursements,
    financeCashOnHand: r.financeCashOnHand,
    isUpThisCycle: r.senateClass == null ? null : r.senateClass === CURRENT_SENATE_CLASS,
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
    .map(toDetail)
    .filter((seat) => !upOnly || seat.isUpThisCycle);

  return { house, senate };
}
