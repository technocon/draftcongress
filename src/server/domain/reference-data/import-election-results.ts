import { prisma } from "@/server/db/client";
import { getElectionResultsAdapter } from "@/server/adapters/election-results";
import type { ElectionResultsPort } from "@/server/adapters/election-results";

const CYCLE = "2026"; // matches prisma/seed.ts's Race.cycle

export interface ElectionResultsImportSummary {
  fetched: number;
  racesMatched: number;
  racesUnmatched: number;
}

/**
 * Pulls each House seat's most recent general-election result (real MEDSL/
 * Harvard Dataverse data once HARVARD_DATAVERSE_API_TOKEN is set,
 * illustrative fixture data otherwise — see
 * src/server/adapters/election-results) and writes lastElectionYear/
 * lastElectionPct onto the matching Race row (by state + district, same
 * matching key as import-congress-members.ts). Senate has no equivalent
 * source wired up yet (see that adapter's own comment for why).
 *
 * `adapter` defaults to the env-based fixture/real split
 * (getElectionResultsAdapter) but accepts an override — used by
 * scripts/import-election-results.ts to point at a locally downloaded
 * copy of the dataset (createLocalFileAdapter) when the live fetch is
 * blocked by Dataverse's guestbook requirement.
 */
export async function runElectionResultsImport(adapter: ElectionResultsPort = getElectionResultsAdapter()): Promise<ElectionResultsImportSummary> {
  const results = await adapter.fetchLatestHouseResults();

  const houseChamber = await prisma.chamber.findFirstOrThrow({ where: { name: "U.S. House of Representatives" } });

  let racesMatched = 0;
  let racesUnmatched = 0;

  for (const result of results) {
    const race = await prisma.race.findFirst({
      where: { chamberId: houseChamber.id, state: result.state, district: result.district, cycle: CYCLE },
    });
    if (!race) {
      racesUnmatched++;
      continue;
    }
    await prisma.race.update({
      where: { id: race.id },
      data: { lastElectionYear: result.year, lastElectionPct: result.winnerPct },
    });
    racesMatched++;
  }

  return { fetched: results.length, racesMatched, racesUnmatched };
}
