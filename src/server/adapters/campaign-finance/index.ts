import type { CampaignFinancePort } from "./port";
import { campaignFinanceFixtureAdapter } from "./fixtures";
import { createFecCampaignFinanceAdapter } from "./fec";

export type { CampaignFinancePort, RawCampaignFinance } from "./port";

/**
 * Returns the fixture adapter unless FEC_API_KEY is set, in which case it
 * returns the real OpenFEC adapter — same activation pattern as the other
 * reference-data adapters. No code changes needed at key-provisioning time.
 */
export function getCampaignFinanceAdapter(): CampaignFinancePort {
  const apiKey = process.env.FEC_API_KEY;
  if (!apiKey) {
    return campaignFinanceFixtureAdapter;
  }
  return createFecCampaignFinanceAdapter(apiKey);
}
