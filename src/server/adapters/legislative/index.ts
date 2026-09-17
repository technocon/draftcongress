import type { LegislativeDataPort } from "./port";
import { legislativeFixtureAdapter } from "./fixtures";
import { createCongressGovAdapter } from "./congress-gov";

export type { ChamberRef, LegislativeDataPort, RawLegislativeEvent } from "./port";
export { chamberRefFor } from "./chamber-ref";

/**
 * Returns the fixture adapter unless CONGRESS_GOV_API_KEY is set in env, in
 * which case it returns the real Congress.gov adapter for all three
 * methods (bill actions, committee actions, AND votes — see
 * ./congress-gov's fetchVotes comment for why GovTrack, the originally
 * intended vote source, was dropped) — the congress.gov key is the whole
 * real-data path's readiness signal, per the architecture plan §4. No code
 * changes are needed at key-provisioning time — this is the entire
 * activation mechanism.
 */
export function getLegislativeAdapter(): LegislativeDataPort {
  const apiKey = process.env.CONGRESS_GOV_API_KEY;
  if (!apiKey) {
    return legislativeFixtureAdapter;
  }

  return createCongressGovAdapter(apiKey);
}
