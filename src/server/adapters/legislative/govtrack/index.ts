import type { ChamberRef, LegislativeDataPort, RawLegislativeEvent } from "../port";

/**
 * GovTrack API v2 adapter — roll-call votes (SRD §10). GovTrack's public
 * API requires no key.
 *
 * IMPORTANT (same caveat as ../congress-gov): built from memory/public
 * docs of https://www.govtrack.us/api/v2, not verified against a live
 * response. In particular: confirm the `chamber` query value (GovTrack
 * historically used numeric codes for house/senate, not the string
 * literals used here) and confirm `vote_voter` responses actually embed a
 * `bioguideid` on the nested person object — verify both against a live
 * call before enabling this in production. Until CONGRESS_GOV_API_KEY (or
 * an explicit opt-in) activates the real legislative adapter set, this
 * code path is inert — see ../index.ts.
 */

const BASE_URL = "https://www.govtrack.us/api/v2";

interface GovTrackVote {
  id: number;
  created: string;
  chamber: string;
  question: string;
}

interface GovTrackVoteListResponse {
  objects: GovTrackVote[];
}

interface GovTrackVoteVoter {
  option_value: string;
  person: { bioguideid?: string };
}

interface GovTrackVoteVoterResponse {
  objects: GovTrackVoteVoter[];
}

export function createGovTrackAdapter(): LegislativeDataPort {
  async function fetchVotesSince(chamberRef: ChamberRef, since: Date): Promise<GovTrackVote[]> {
    const url = new URL(`${BASE_URL}/vote`);
    url.searchParams.set("chamber", chamberRef);
    url.searchParams.set("created__gte", since.toISOString().slice(0, 10));
    url.searchParams.set("sort", "-created");
    url.searchParams.set("limit", "100");

    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`GovTrack vote list request failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as GovTrackVoteListResponse;
    return data.objects ?? [];
  }

  async function fetchVoters(voteId: number): Promise<GovTrackVoteVoter[]> {
    const url = new URL(`${BASE_URL}/vote_voter`);
    url.searchParams.set("vote", String(voteId));
    url.searchParams.set("limit", "500");

    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`GovTrack vote_voter request failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as GovTrackVoteVoterResponse;
    return data.objects ?? [];
  }

  return {
    async fetchVotes(chamberRef, since) {
      const votes = await fetchVotesSince(chamberRef, since);
      const events: RawLegislativeEvent[] = [];

      for (const vote of votes) {
        const voters = await fetchVoters(vote.id);
        for (const voter of voters) {
          if (!voter.person.bioguideid) continue;
          events.push({
            externalId: `govtrack-vote-${vote.id}-${voter.person.bioguideid}`,
            eventType: "vote_cast",
            occurredAt: new Date(vote.created),
            memberBioguideId: voter.person.bioguideid,
            description: vote.question,
          });
        }
      }

      return events;
    },
    async fetchBillActions() {
      throw new Error("fetchBillActions is not implemented on the GovTrack adapter — use Congress.gov.");
    },
    async fetchCommitteeActions() {
      throw new Error("fetchCommitteeActions is not implemented on the GovTrack adapter — use Congress.gov.");
    },
  };
}
