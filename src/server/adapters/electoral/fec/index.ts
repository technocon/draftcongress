import type { ElectoralDataPort, RawElectoralEvent } from "../port";

/**
 * FEC (OpenFEC, api.open.fec.gov) adapter.
 *
 * HONEST LIMITATION, not an oversight: the FEC's public API is campaign
 * *finance* data (filings, candidacy registration, disbursements) — it is
 * not an authoritative source for general-election win/loss results.
 * SRD §10 lists "FEC, official state election sites" as an *assumed, not
 * confirmed* source for "Candidate/electoral results" and flags this
 * exact gap in §11 open question #3. This adapter implements
 * fetchPrimaryResults against FEC's /v1/elections/ endpoint (which does
 * carry primary-election candidate/vote data) as a reasonable best effort;
 * fetchRaceResults (re_election_won / seat_flip) intentionally throws
 * rather than silently returning wrong or incomplete data — a real
 * general-election-results source (AP Elections API, state SOS feeds,
 * etc.) needs to be selected and licensed before that method can be
 * implemented for real. Until CONGRESS_GOV_API_KEY (the readiness signal
 * for the whole real-data path, see ../legislative/index.ts) plus a
 * dedicated election-results source are both in place, the fixture
 * adapter (../fixtures) is what's actually wired up — see ../index.ts.
 *
 * Field names below are from memory of OpenFEC's public docs, not
 * verified against a live response — confirm before relying on this.
 */

const BASE_URL = "https://api.open.fec.gov/v1";

interface FecElectionResult {
  candidate_id: string;
  bioguide_id?: string;
  election_date?: string;
  office: string;
}

interface FecElectionsResponse {
  results: FecElectionResult[];
}

export function createFecAdapter(apiKey: string): ElectoralDataPort {
  return {
    async fetchPrimaryResults(chamberRef, since) {
      const url = new URL(`${BASE_URL}/elections/`);
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("office", chamberRef === "house" ? "H" : "S");
      url.searchParams.set("election_full", "false"); // primaries, not general
      url.searchParams.set("min_election_date", since.toISOString().slice(0, 10));

      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        throw new Error(`FEC elections request failed: ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as FecElectionsResponse;

      const events: RawElectoralEvent[] = [];
      for (const result of data.results ?? []) {
        if (!result.bioguide_id || !result.election_date) continue;
        events.push({
          externalId: `fec-primary-${result.candidate_id}-${result.election_date}`,
          eventType: "primary_result",
          occurredAt: new Date(result.election_date),
          memberBioguideId: result.bioguide_id,
          description: `Primary result, office ${result.office}`,
        });
      }
      return events;
    },

    async fetchRaceResults() {
      throw new Error(
        "fetchRaceResults (general-election win/loss + seat flips) has no confirmed data source yet " +
          "— SRD §11 open question #3. FEC's API is campaign-finance data, not race results. " +
          "Select and license an authoritative source (AP Elections API, state SOS feeds) before implementing this."
      );
    },
  };
}
