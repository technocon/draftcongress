import type { CongressMembersPort } from "./port";
import { congressMembersFixtureAdapter } from "./fixtures";
import { createCongressGovMembersAdapter } from "./congress-gov";

export type { CongressMembersPort, RawMember } from "./port";

/**
 * Returns the fixture adapter unless CONGRESS_GOV_API_KEY is set, in which
 * case it returns the real congress.gov adapter — same activation
 * mechanism as ../legislative/index.ts's getLegislativeAdapter(). No code
 * changes needed at key-provisioning time.
 */
export function getCongressMembersAdapter(): CongressMembersPort {
  const apiKey = process.env.CONGRESS_GOV_API_KEY;
  if (!apiKey) {
    return congressMembersFixtureAdapter;
  }
  return createCongressGovMembersAdapter(apiKey);
}
