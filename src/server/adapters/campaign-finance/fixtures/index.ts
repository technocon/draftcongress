import type { CampaignFinancePort, RawCampaignFinance } from "../port";
import financeRaw from "./data/finance.json";

/**
 * Fixture-backed CampaignFinancePort implementation — the default when no
 * FEC_API_KEY is configured (see ../index.ts's factory). Covers the same
 * handful of illustrative seats as the other reference-data fixtures.
 */
export const campaignFinanceFixtureAdapter: CampaignFinancePort = {
  async fetchCurrentCycleFinance(): Promise<RawCampaignFinance[]> {
    return financeRaw as RawCampaignFinance[];
  },
};
