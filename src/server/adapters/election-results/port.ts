/**
 * One seat's most recent GENERAL election result — the winning
 * candidate's share of that district's total vote. Fusion-ticket vote
 * lines (a candidate appearing under more than one party in the same
 * race, e.g. in NY) are summed per candidate before picking the winner —
 * see MEDSL's own codebook guidance in the real adapter's comment.
 */
export interface RawElectionResult {
  state: string; // 2-letter USPS code
  chamber: "house" | "senate";
  /** 1-based House district (at-large states use 1, matching
   * src/lib/us-house-apportionment.ts's convention); null for Senate. */
  district: number | null;
  year: number;
  winnerPct: number; // 0-100
}

/**
 * The boundary between the election-results import script and any
 * upstream provider of real district-level election outcomes. Real and
 * fixture implementations satisfy this same shape — see ./index.ts's
 * getElectionResultsAdapter().
 */
export interface ElectionResultsPort {
  fetchLatestHouseResults(): Promise<RawElectionResult[]>;
}
