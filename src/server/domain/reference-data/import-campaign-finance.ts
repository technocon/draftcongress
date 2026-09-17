import { prisma } from "@/server/db/client";
import { getCampaignFinanceAdapter } from "@/server/adapters/campaign-finance";

const CYCLE = "2026"; // matches prisma/seed.ts's Race.cycle

export interface CampaignFinanceImportSummary {
  fetched: number;
  racesMatched: number;
  racesUnmatched: number;
}

/**
 * Pulls each race's current-cycle campaign-finance snapshot (real FEC/
 * OpenFEC data once FEC_API_KEY is set, illustrative fixture data
 * otherwise — see src/server/adapters/campaign-finance) and writes it onto
 * the matching Race row (by state + district for House, matching
 * import-congress-members.ts's stable-order assignment for Senate, since
 * FEC's response doesn't distinguish which of a state's two seats is up
 * this cycle any more than congress.gov's member list does).
 */
export async function runCampaignFinanceImport(): Promise<CampaignFinanceImportSummary> {
  const adapter = getCampaignFinanceAdapter();
  const results = await adapter.fetchCurrentCycleFinance();

  const houseChamber = await prisma.chamber.findFirstOrThrow({ where: { name: "U.S. House of Representatives" } });
  const senateChamber = await prisma.chamber.findFirstOrThrow({ where: { name: "U.S. Senate" } });

  let racesMatched = 0;
  let racesUnmatched = 0;

  for (const result of results) {
    const chamberId = result.chamber === "house" ? houseChamber.id : senateChamber.id;
    // Senate: a state's Senate race this cycle could be either of its two
    // seats — since we don't track which "class" is up, attach to
    // whichever Senate Seat row for that state doesn't already have
    // finance data this cycle, so re-running the import doesn't keep
    // clobbering the same seat if a state somehow has two results.
    const race =
      result.chamber === "house"
        ? await prisma.race.findFirst({ where: { chamberId, state: result.state, district: result.district, cycle: CYCLE } })
        : await prisma.race.findFirst({
            where: { chamberId, state: result.state, cycle: CYCLE, OR: [{ financeCycle: null }, { financeCycle: { not: Number(CYCLE) } }] },
            orderBy: { seatLabel: "asc" },
          });

    if (!race) {
      racesUnmatched++;
      continue;
    }
    await prisma.race.update({
      where: { id: race.id },
      data: {
        financeCycle: result.cycle,
        financeCandidate: result.candidateName,
        financeReceipts: result.receipts,
        financeDisbursements: result.disbursements,
        financeCashOnHand: result.cashOnHand,
      },
    });
    racesMatched++;
  }

  return { fetched: results.length, racesMatched, racesUnmatched };
}
