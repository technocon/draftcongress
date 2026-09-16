import type { CongressMembersPort, RawMember } from "../port";
import membersRaw from "./data/members.json";

/**
 * Fixture-backed CongressMembersPort implementation — the default when no
 * CONGRESS_GOV_API_KEY is configured (see ../index.ts's factory). Mirrors
 * the illustrative Legislators already in prisma/seed.ts (same bioguideIds)
 * so the member-import script is exercisable with zero external accounts,
 * per the architecture plan §4 — it's not a full 535-member roster, just
 * enough to prove the import/matching logic end-to-end.
 */
export const congressMembersFixtureAdapter: CongressMembersPort = {
  async fetchCurrentMembers(): Promise<RawMember[]> {
    return membersRaw as RawMember[];
  },
};
