import type { ElectoralDataPort } from "../port";

/**
 * FEC (OpenFEC, api.open.fec.gov) adapter.
 *
 * HONEST LIMITATION, not an oversight: the FEC's public API is campaign
 * *finance* data (filings, candidacy registration, disbursements) — it is
 * not an authoritative source for either general-election OR primary-
 * election win/loss results. Both methods below intentionally throw
 * rather than silently returning wrong data.
 *
 * fetchPrimaryResults used to attempt this against /v1/elections/, on the
 * assumption (from memory, never verified) that it carried primary vote
 * results keyed by bioguide_id. Confirmed live instead: that endpoint
 * returns campaign-finance totals per candidate (receipts, disbursements,
 * cash on hand) with no bioguide_id and no vote data — see
 * src/server/adapters/campaign-finance/fec, which does the real thing
 * this endpoint is actually good for. SRD §11 open question #3 (general-
 * election results) and the equivalent gap for primary results both
 * remain open — a real vote-result source (AP Elections API, state SOS
 * feeds, a primaries-specific dataset) needs to be selected before either
 * method here can return real data. Until then, the fixture adapter
 * (../fixtures) is what's actually wired up for scoring ingestion — see
 * ../index.ts.
 */

export function createFecAdapter(_apiKey: string): ElectoralDataPort {
  return {
    async fetchPrimaryResults() {
      throw new Error(
        "fetchPrimaryResults has no confirmed data source yet. FEC's /v1/elections/ endpoint " +
          "(confirmed live) is campaign-finance data, not primary vote results — see " +
          "src/server/adapters/campaign-finance for what it's actually used for. " +
          "Select and license an authoritative primary-results source before implementing this."
      );
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
