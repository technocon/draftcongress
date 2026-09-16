import type { CongressMembersPort, RawMember } from "../port";
import { codeForStateName } from "@/lib/us-states";

/**
 * Congress.gov API v3 member adapter — GET /v3/member, the current-Congress
 * roster (bioguideId, state, party, district, chamber). Field shapes below
 * are confirmed against the Library of Congress's own published examples
 * (github.com/LibraryOfCongress/api.congress.gov, Documentation/MemberEndpoint.md),
 * not a live call — verify pagination behavior against a real response
 * once CONGRESS_GOV_API_KEY is set, since the docs don't fully spell out
 * pagination.next semantics.
 */

const BASE_URL = "https://api.congress.gov/v3";
const PAGE_LIMIT = 250;

interface CongressGovMemberTerm {
  chamber: string; // "Senate" | "House of Representatives"
  startYear?: number;
  endYear?: number;
}

interface CongressGovMemberSummary {
  bioguideId: string;
  state: string; // full name, e.g. "Vermont"
  partyName?: string; // e.g. "Democratic", "Republican", "Independent"
  district?: number; // present (0 for at-large) on House members; absent/0 for senators
  name: string; // "Last, First" — directOrderName isn't on the list endpoint
  // NOT a bare array despite the published docs example — the live API
  // wraps it as { item: [...] } (confirmed against a live call).
  terms?: { item?: CongressGovMemberTerm[] };
}

interface CongressGovMemberListResponse {
  members: CongressGovMemberSummary[];
  pagination?: { count: number };
}

function normalizeParty(partyName: string | undefined): "D" | "R" | "I" {
  if (!partyName) return "I";
  if (partyName.startsWith("Democrat")) return "D";
  if (partyName.startsWith("Republican")) return "R";
  return "I";
}

function normalizeFullName(name: string): string {
  // "Leahy, Patrick J." -> "Patrick J. Leahy" — the list endpoint only
  // gives invertedOrderName, unlike the per-member detail endpoint.
  const [last, first] = name.split(",").map((s) => s.trim());
  return first ? `${first} ${last}` : name;
}

function chamberOf(member: CongressGovMemberSummary): "house" | "senate" | null {
  const terms = member.terms?.item ?? [];
  const latestTerm = terms[terms.length - 1];
  if (!latestTerm) return null;
  if (latestTerm.chamber === "Senate") return "senate";
  if (latestTerm.chamber === "House of Representatives") return "house";
  return null;
}

export function createCongressGovMembersAdapter(apiKey: string): CongressMembersPort {
  async function fetchPage(offset: number): Promise<CongressGovMemberListResponse> {
    const url = new URL(`${BASE_URL}/member`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("format", "json");
    url.searchParams.set("currentMember", "true");
    url.searchParams.set("limit", String(PAGE_LIMIT));
    url.searchParams.set("offset", String(offset));

    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`Congress.gov member list request failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as CongressGovMemberListResponse;
  }

  return {
    async fetchCurrentMembers(): Promise<RawMember[]> {
      const all: CongressGovMemberSummary[] = [];
      let offset = 0;
      for (;;) {
        const page = await fetchPage(offset);
        const members = page.members ?? [];
        all.push(...members);
        offset += PAGE_LIMIT;
        const total = page.pagination?.count ?? all.length;
        if (members.length < PAGE_LIMIT || all.length >= total) break;
      }

      const result: RawMember[] = [];
      for (const m of all) {
        const stateCode = codeForStateName(m.state);
        const chamber = chamberOf(m);
        // Skips non-voting territory/DC delegates (no 2-letter state match)
        // and any member whose current chamber can't be determined.
        if (!stateCode || !chamber) continue;

        result.push({
          bioguideId: m.bioguideId,
          fullName: normalizeFullName(m.name),
          party: normalizeParty(m.partyName),
          state: stateCode,
          chamber,
          // congress.gov represents at-large House districts as 0; our
          // schema stores district = 1 for at-large (see
          // src/lib/us-house-apportionment.ts).
          district: chamber === "house" ? (m.district && m.district > 0 ? m.district : 1) : null,
        });
      }
      return result;
    },
  };
}
