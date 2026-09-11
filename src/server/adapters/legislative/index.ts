import type { LegislativeDataPort } from "./port";
import { legislativeFixtureAdapter } from "./fixtures";
import { createCongressGovAdapter } from "./congress-gov";
import { createGovTrackAdapter } from "./govtrack";

export type { ChamberRef, LegislativeDataPort, RawLegislativeEvent } from "./port";
export { chamberRefFor } from "./chamber-ref";

/**
 * Returns the fixture adapter unless CONGRESS_GOV_API_KEY is set in env, in
 * which case it returns a composed real adapter (Congress.gov for bill
 * actions/committee actions, GovTrack for votes — GovTrack needs no key of
 * its own, but the whole real-data path is gated on the congress.gov key
 * as the readiness signal, per the architecture plan §4). No code changes
 * are needed at key-provisioning time — this is the entire activation
 * mechanism.
 */
export function getLegislativeAdapter(): LegislativeDataPort {
  const apiKey = process.env.CONGRESS_GOV_API_KEY;
  if (!apiKey) {
    return legislativeFixtureAdapter;
  }

  const congressGov = createCongressGovAdapter(apiKey);
  const govTrack = createGovTrackAdapter();

  return {
    fetchBillActions: congressGov.fetchBillActions,
    fetchCommitteeActions: congressGov.fetchCommitteeActions,
    fetchVotes: govTrack.fetchVotes,
  };
}
