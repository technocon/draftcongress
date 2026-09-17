import { prisma } from "@/server/db/client";
import { getRaceRatingsAdapter } from "@/server/adapters/race-ratings";

const CYCLE = "2026"; // matches prisma/seed.ts's Race.cycle

export interface RaceRatingsImportSummary {
  fetched: number;
  racesMatched: number;
  racesUnmatched: number;
}

/**
 * Pulls current Senate race-competitiveness ratings (real Cook/Sabato/
 * Inside Elections data once DECISION_LABS_RATINGS_ENABLED=true,
 * illustrative fixture data otherwise — see
 * src/server/adapters/race-ratings) and overwrites Race.rating for the
 * matching Senate seat — same stable "first seat by seatLabel" pick as
 * import-campaign-finance.ts for the two-seats-per-state ambiguity (we
 * don't track which of a state's two Senate seats is up this cycle).
 * House ratings are untouched — no House-covering source found yet.
 */
export async function runRaceRatingsImport(): Promise<RaceRatingsImportSummary> {
  const adapter = getRaceRatingsAdapter();
  const results = await adapter.fetchCurrentCycleRatings();

  const senateChamber = await prisma.chamber.findFirstOrThrow({ where: { name: "U.S. Senate" } });

  let racesMatched = 0;
  let racesUnmatched = 0;

  for (const result of results) {
    const race = await prisma.race.findFirst({
      where: { chamberId: senateChamber.id, state: result.state, cycle: CYCLE },
      orderBy: { seatLabel: "asc" },
    });
    if (!race) {
      racesUnmatched++;
      continue;
    }
    await prisma.race.update({ where: { id: race.id }, data: { rating: result.rating } });
    racesMatched++;
  }

  return { fetched: results.length, racesMatched, racesUnmatched };
}
