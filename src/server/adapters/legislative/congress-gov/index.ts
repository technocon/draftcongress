import type { ChamberRef, LegislativeDataPort, RawLegislativeEvent } from "../port";

/**
 * Congress.gov API v3 adapter — bill sponsorship/passage + committee
 * referrals (SRD §10: "Bill sponsorship/passage, votes → Congress.gov,
 * GovTrack"; committee actions here too, since congress.gov's bill-action
 * feed includes committee-referral actions).
 *
 * IMPORTANT: the request/pagination shape (this file) is now confirmed
 * against a live call — `fromDateTime` specifically needs
 * '%Y-%m-%dT%H:%M:%SZ' with no milliseconds, unlike Date#toISOString()'s
 * default. `mapBillToEvents`'s response-field assumptions (`latestAction`,
 * `sponsors`) are still unverified against a live bill payload — confirm
 * those before relying on this in production. getLegislativeAdapter()
 * falls back to the fixture adapter whenever CONGRESS_GOV_API_KEY is unset.
 *
 * `fetchVotes` (House only — see its own comment) is also confirmed
 * against a live call: GovTrack's public API (the originally-intended
 * roll-call-vote source, ../govtrack) turned out to be impractical —
 * its `vote` resource exposes no usable id in list responses, and the
 * only related-field filter its `vote_voter` resource accepts
 * (`vote__chamber`) is far too broad to isolate one vote's voters. This
 * adapter uses congress.gov's own /v3/house-vote endpoints instead.
 */

const BASE_URL = "https://api.congress.gov/v3";
const CONGRESS_NUMBER = 119; // 119th Congress (2025-2027) — bump for the next cycle.
const CONGRESS_FIRST_YEAR = 2025; // first calendar year of CONGRESS_NUMBER — bump together.

interface CongressGovBillSummary {
  congress: number;
  type: string;
  number: string;
  updateDate: string;
  introducedDate?: string;
  latestAction?: { actionDate: string; text: string };
  sponsors?: Array<{ bioguideId: string }>;
}

interface CongressGovBillListResponse {
  bills: CongressGovBillSummary[];
}

interface CongressGovHouseVoteSummary {
  congress: number;
  sessionNumber: number;
  rollCallNumber: number;
  startDate: string;
  legislationType?: string;
  legislationNumber?: string;
}

interface CongressGovHouseVoteListResponse {
  houseRollCallVotes: CongressGovHouseVoteSummary[];
}

// NOTE: the field is `bioguideID` (capital ID) on this endpoint's live
// response, NOT `bioguideId` as the published docs example shows —
// confirmed by an actual call, not assumed.
interface CongressGovHouseVoteMemberResult {
  bioguideID: string;
  voteCast: string; // "Aye" | "No" | "Present" | "Not Voting"
}

interface CongressGovHouseVoteMembersResponse {
  houseRollCallVoteMemberVotes: { results: CongressGovHouseVoteMemberResult[] };
}

function sessionNumberFor(date: Date): 1 | 2 {
  const year = date.getUTCFullYear();
  return (year - CONGRESS_FIRST_YEAR) % 2 === 0 ? 1 : 2;
}

export function createCongressGovAdapter(apiKey: string): LegislativeDataPort {
  async function fetchRecentBills(since: Date): Promise<CongressGovBillSummary[]> {
    const url = new URL(`${BASE_URL}/bill/${CONGRESS_NUMBER}`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("format", "json");
    url.searchParams.set("sort", "updateDate+asc");
    // Confirmed against a live 400 response: congress.gov wants
    // '%Y-%m-%dT%H:%M:%SZ' (no milliseconds) — Date#toISOString() includes
    // them, so they must be stripped.
    url.searchParams.set("fromDateTime", since.toISOString().replace(/\.\d{3}Z$/, "Z"));
    url.searchParams.set("limit", "250");

    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`Congress.gov bill list request failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as CongressGovBillListResponse;
    return data.bills ?? [];
  }

  function mapBillToEvents(bill: CongressGovBillSummary): RawLegislativeEvent[] {
    const events: RawLegislativeEvent[] = [];
    const billRef = `${bill.congress}-${bill.type}${bill.number}`;
    const sponsorBioguideId = bill.sponsors?.[0]?.bioguideId;

    if (bill.introducedDate && sponsorBioguideId) {
      events.push({
        externalId: `bill-sponsored-${billRef}`,
        eventType: "bill_sponsored",
        occurredAt: new Date(bill.introducedDate),
        memberBioguideId: sponsorBioguideId,
        description: `${billRef} introduced`,
      });
    }

    const actionText = bill.latestAction?.text?.toLowerCase() ?? "";
    if (bill.latestAction && /passed|became public law|agreed to/.test(actionText)) {
      events.push({
        externalId: `bill-passed-${billRef}-${bill.latestAction.actionDate}`,
        eventType: "bill_passed",
        occurredAt: new Date(bill.latestAction.actionDate),
        memberBioguideId: sponsorBioguideId,
        description: bill.latestAction.text,
      });
    }
    if (bill.latestAction && /committee/.test(actionText) && !/passed/.test(actionText)) {
      events.push({
        externalId: `committee-action-${billRef}-${bill.latestAction.actionDate}`,
        eventType: "committee_action",
        occurredAt: new Date(bill.latestAction.actionDate),
        memberBioguideId: sponsorBioguideId,
        description: bill.latestAction.text,
      });
    }

    return events;
  }

  async function fetchHouseVotesSince(since: Date): Promise<CongressGovHouseVoteSummary[]> {
    const session = sessionNumberFor(since);
    const collected: CongressGovHouseVoteSummary[] = [];
    let offset = 0;
    for (;;) {
      const url = new URL(`${BASE_URL}/house-vote/${CONGRESS_NUMBER}/${session}`);
      url.searchParams.set("api_key", apiKey);
      url.searchParams.set("format", "json");
      url.searchParams.set("limit", "250");
      url.searchParams.set("offset", String(offset));

      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        throw new Error(`Congress.gov house-vote list request failed: ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as CongressGovHouseVoteListResponse;
      const page = data.houseRollCallVotes ?? [];
      if (page.length === 0) break;

      // No documented (or observed) ordering guarantee on this list — a
      // live call showed offset 0 returning OLDER votes, not the newest —
      // so unlike fetchRecentBills (which sorts explicitly), this can't
      // stop early on a date cutoff. A session tops out around ~300-400
      // votes (2 pages at this limit), so paging fully is still cheap;
      // it's the per-vote member-detail fetch below that must stay bounded
      // by `since`, which client-side filtering here still guarantees.
      collected.push(...page);
      if (page.length < 250) break;
      offset += 250;
    }
    return collected.filter((vote) => new Date(vote.startDate) >= since);
  }

  async function fetchHouseVoteMembers(vote: CongressGovHouseVoteSummary): Promise<CongressGovHouseVoteMemberResult[]> {
    const url = new URL(`${BASE_URL}/house-vote/${vote.congress}/${vote.sessionNumber}/${vote.rollCallNumber}/members`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "500");

    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`Congress.gov house-vote member request failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as CongressGovHouseVoteMembersResponse;
    return data.houseRollCallVoteMemberVotes?.results ?? [];
  }

  return {
    // congress.gov's bill list isn't filtered by chamber directly in this
    // simplified query — `chamberRef` is accepted for port-interface
    // compatibility and to filter client-side once `originChamber` is
    // confirmed present on the bill summary response.
    async fetchBillActions(_chamberRef: ChamberRef, since: Date) {
      const bills = await fetchRecentBills(since);
      return bills.flatMap(mapBillToEvents).filter((e) => e.eventType !== "committee_action");
    },
    async fetchCommitteeActions(_chamberRef: ChamberRef, since: Date) {
      const bills = await fetchRecentBills(since);
      return bills.flatMap(mapBillToEvents).filter((e) => e.eventType === "committee_action");
    },
    async fetchVotes(chamberRef: ChamberRef, since: Date) {
      // HONEST LIMITATION, not an oversight (same pattern as
      // ../../electoral/fec's fetchRaceResults): congress.gov's roll-call
      // vote data only covers the House (/v3/house-vote) — there is no
      // /v3/senate-vote (confirmed: 404 live), and GovTrack, the
      // originally-intended source for both chambers, turned out to be
      // impractical (see this file's top comment). A Senate vote source
      // needs to be selected before this can return real Senate data.
      if (chamberRef === "senate") {
        throw new Error(
          "fetchVotes has no confirmed data source for the Senate — congress.gov's /v3/house-vote is House-only " +
            "and GovTrack's public API proved impractical (no usable vote id, vote_voter filtering too broad)."
        );
      }

      const votes = await fetchHouseVotesSince(since);
      const events: RawLegislativeEvent[] = [];
      for (const vote of votes) {
        const members = await fetchHouseVoteMembers(vote);
        const description = vote.legislationType && vote.legislationNumber ? `${vote.legislationType} ${vote.legislationNumber}` : "House roll call vote";
        for (const member of members) {
          if (!member.bioguideID) continue;
          events.push({
            externalId: `congress-gov-vote-${vote.congress}-${vote.sessionNumber}-${vote.rollCallNumber}-${member.bioguideID}`,
            eventType: "vote_cast",
            occurredAt: new Date(vote.startDate),
            memberBioguideId: member.bioguideID,
            description: `${description} — ${member.voteCast}`,
          });
        }
      }
      return events;
    },
  };
}
