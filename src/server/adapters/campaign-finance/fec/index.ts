import type { CampaignFinancePort, RawCampaignFinance } from "../port";
import { HOUSE_SEATS_BY_STATE } from "@/lib/us-house-apportionment";
import { US_STATES } from "@/lib/us-states";

/**
 * OpenFEC (api.open.fec.gov) /v1/elections/ adapter — confirmed live, not
 * assumed: the pre-existing FEC adapter (../../electoral/fec) was built
 * "from memory" and turned out to be wrong on every count once actually
 * tested — office wants the full word ("house"/"senate"), a `cycle` is
 * REQUIRED (not a date filter), and (the reason this adapter exists
 * separately) the response has no bioguide_id or vote data at all: it's
 * campaign-finance totals per candidate (receipts/disbursements/cash on
 * hand), keyed by state+district+office+cycle, with an
 * `incumbent_challenge_full` flag ("Incumbent"/"Challenger"/"Open") this
 * adapter uses to pick whose totals represent the race.
 *
 * office=house REQUIRES both `state` and `district` (confirmed: omitting
 * either 422s) — there's no bulk "all districts" query, so this fetches
 * one race at a time: 435 House + up to 50 Senate calls. At-large House
 * districts use district="00" (confirmed live — "01" returns zero
 * results), matching Census convention, not our internal district=1.
 *
 * Rate limit confirmed via response headers: 60/min for this key tier.
 * Throttled well under that (~4/sec) with 429 backoff-retry, so a full
 * sweep takes a few minutes rather than risking a lockout.
 *
 * A ~485-call sweep over several minutes WILL occasionally hit a bare
 * network error (confirmed live: an EADDRNOTAVAIL mid-run, unrelated to
 * FEC — local ephemeral-port/connection churn from that many sequential
 * requests) — fetchRace retries those the same as a 429, and
 * fetchCurrentCycleFinance skips (not aborts on) a single race that still
 * fails after retries, so one bad request doesn't throw away several
 * minutes of otherwise-successful progress.
 */

const BASE_URL = "https://api.open.fec.gov/v1";
const CYCLE = 2026; // current cycle — bump alongside prisma/seed.ts's Race.cycle
const REQUEST_DELAY_MS = 260; // ~3.8/sec, under the 60/min limit with margin

interface FecElectionCandidate {
  candidate_name: string;
  incumbent_challenge_full?: string; // "Incumbent" | "Challenger" | "Open"
  total_receipts?: number;
  total_disbursements?: number;
  cash_on_hand_end_period?: number;
}

interface FecElectionsResponse {
  results: FecElectionCandidate[];
}

function normalizeCandidateName(raw: string): string {
  // "MORAN, NATHANIEL QUENTIN" -> "Nathaniel Quentin Moran"
  const [last, first] = raw.split(",").map((s) => s.trim());
  const title = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return first ? `${title(first)} ${title(last)}` : title(raw);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createFecCampaignFinanceAdapter(apiKey: string): CampaignFinancePort {
  async function fetchRace(office: "house" | "senate", state: string, district: string | null): Promise<FecElectionCandidate[]> {
    const raceLabel = `${office} ${state}${district ? `-${district}` : ""}`;
    const url = new URL(`${BASE_URL}/elections/`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("office", office);
    url.searchParams.set("cycle", String(CYCLE));
    url.searchParams.set("election_full", "false");
    url.searchParams.set("state", state);
    if (district !== null) url.searchParams.set("district", district);

    const maxAttempts = 5;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (res.status === 429) {
          await sleep(2000 * (attempt + 1));
          continue;
        }
        if (!res.ok) {
          throw new Error(`FEC elections request failed (${raceLabel}): ${res.status} ${res.statusText}`);
        }
        const data = (await res.json()) as FecElectionsResponse;
        return data.results ?? [];
      } catch (err) {
        // Bare network errors (confirmed live: an EADDRNOTAVAIL mid-sweep,
        // unrelated to FEC itself) get the same retry treatment as a 429
        // rather than propagating — see this file's top comment.
        if (attempt === maxAttempts - 1) {
          console.warn(`Skipping ${raceLabel} after ${maxAttempts} failed attempts: ${err instanceof Error ? err.message : err}`);
          return [];
        }
        await sleep(1000 * (attempt + 1));
      }
    }
    return [];
  }

  function pickRaceCandidate(candidates: FecElectionCandidate[]): FecElectionCandidate | null {
    if (candidates.length === 0) return null;
    const incumbent = candidates.find((c) => c.incumbent_challenge_full === "Incumbent");
    if (incumbent) return incumbent;
    // Open seat / no incumbent flag — the top fundraiser is the closest
    // thing to a meaningful single "this race's finance" figure.
    return [...candidates].sort((a, b) => (b.total_receipts ?? 0) - (a.total_receipts ?? 0))[0];
  }

  function toRawResult(
    candidate: FecElectionCandidate,
    state: string,
    chamber: "house" | "senate",
    district: number | null
  ): RawCampaignFinance {
    return {
      state,
      chamber,
      district,
      cycle: CYCLE,
      candidateName: normalizeCandidateName(candidate.candidate_name),
      isIncumbent: candidate.incumbent_challenge_full === "Incumbent",
      receipts: candidate.total_receipts ?? 0,
      disbursements: candidate.total_disbursements ?? 0,
      cashOnHand: candidate.cash_on_hand_end_period ?? 0,
    };
  }

  return {
    async fetchCurrentCycleFinance(): Promise<RawCampaignFinance[]> {
      const results: RawCampaignFinance[] = [];
      let completed = 0;
      const total = Object.values(HOUSE_SEATS_BY_STATE).reduce((a, b) => a + b, 0) + US_STATES.length;

      for (const [state, seatCount] of Object.entries(HOUSE_SEATS_BY_STATE)) {
        for (let district = 1; district <= seatCount; district++) {
          const fecDistrict = seatCount === 1 ? "00" : String(district).padStart(2, "0");
          const candidates = await fetchRace("house", state, fecDistrict);
          const picked = pickRaceCandidate(candidates);
          if (picked) results.push(toRawResult(picked, state, "house", district));
          completed++;
          if (completed % 50 === 0) console.log(`  ...${completed}/${total} races fetched`);
          await sleep(REQUEST_DELAY_MS);
        }
      }

      for (const s of US_STATES) {
        const candidates = await fetchRace("senate", s.code, null);
        completed++;
        if (completed % 50 === 0) console.log(`  ...${completed}/${total} races fetched`);
        const picked = pickRaceCandidate(candidates);
        // Most states have no Senate race this cycle (staggered 6-year
        // terms) — an empty result here is expected, not an error.
        if (picked) results.push(toRawResult(picked, s.code, "senate", null));
        await sleep(REQUEST_DELAY_MS);
      }

      return results;
    },
  };
}
