/**
 * A current member of Congress, normalized to the shape
 * scripts/import-congress-members.ts needs to upsert Legislator rows and
 * link them to the matching Race (by state + district for House, by state
 * for Senate — see prisma/seed.ts / src/lib/us-house-apportionment.ts).
 */
export interface RawMember {
  bioguideId: string;
  fullName: string;
  party: "D" | "R" | "I";
  /** 2-letter USPS state code. Territory/DC delegates (no House-apportioned
   * seat in our schema) are filtered out before this DTO is produced. */
  state: string;
  chamber: "house" | "senate";
  /** 1-based House district (at-large states use 1). Always null for Senate. */
  district: number | null;
}

/**
 * The boundary between the member-import script and any upstream
 * congress.gov-shaped member-data provider. Real and fixture
 * implementations satisfy this same shape — see ./index.ts's
 * getCongressMembersAdapter().
 */
export interface CongressMembersPort {
  fetchCurrentMembers(): Promise<RawMember[]>;
}
