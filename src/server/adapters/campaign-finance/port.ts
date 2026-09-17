/**
 * One race's campaign-finance snapshot for the CURRENT election cycle —
 * whoever FEC flags as the incumbent (or the top fundraiser, for an open
 * seat with no incumbent flag).
 */
export interface RawCampaignFinance {
  state: string; // 2-letter USPS code
  chamber: "house" | "senate";
  /** 1-based House district (at-large states use 1, matching
   * src/lib/us-house-apportionment.ts's convention); null for Senate. */
  district: number | null;
  cycle: number;
  candidateName: string;
  isIncumbent: boolean;
  receipts: number;
  disbursements: number;
  cashOnHand: number;
}

/**
 * The boundary between the campaign-finance import script and any
 * upstream provider of real candidate fundraising data. Real and fixture
 * implementations satisfy this same shape — see ./index.ts's
 * getCampaignFinanceAdapter().
 */
export interface CampaignFinancePort {
  fetchCurrentCycleFinance(): Promise<RawCampaignFinance[]>;
}
