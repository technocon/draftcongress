import type { ChamberRef, LegislativeDataPort, RawLegislativeEvent } from "../port";

/**
 * Congress.gov API v3 adapter — bill sponsorship/passage + committee
 * referrals (SRD §10: "Bill sponsorship/passage, votes → Congress.gov,
 * GovTrack"; committee actions here too, since congress.gov's bill-action
 * feed includes committee-referral actions).
 *
 * IMPORTANT: this is built against the documented shape of
 * https://api.congress.gov/v3 from memory/public docs, NOT verified
 * against a live response (no API key exists yet — see the architecture
 * plan §4/§8, decision #4: adapters are built now, activated automatically
 * once CONGRESS_GOV_API_KEY is set). Before relying on this in production:
 * confirm field names (especially `latestAction`, `sponsors`, pagination
 * via `offset`/`limit`) against a live call and adjust `mapBillToEvents`
 * accordingly. Until then, getLegislativeAdapter() falls back to the
 * fixture adapter, so this code path is inert.
 */

const BASE_URL = "https://api.congress.gov/v3";
const CONGRESS_NUMBER = 119; // 119th Congress (2025-2027) — bump for the next cycle.

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

export function createCongressGovAdapter(apiKey: string): LegislativeDataPort {
  async function fetchRecentBills(since: Date): Promise<CongressGovBillSummary[]> {
    const url = new URL(`${BASE_URL}/bill/${CONGRESS_NUMBER}`);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("format", "json");
    url.searchParams.set("sort", "updateDate+asc");
    url.searchParams.set("fromDateTime", since.toISOString());
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
    async fetchVotes() {
      // Congress.gov's v3 API does not expose a roll-call vote feed — see
      // ../govtrack/index.ts, which is the adapter actually registered for
      // fetchVotes in the factory (./index.ts).
      throw new Error("fetchVotes is not implemented on the Congress.gov adapter — use GovTrack.");
    },
  };
}
