import type { ElectionResultsPort, RawElectionResult } from "../port";

/**
 * MIT Election Data + Science Lab's "U.S. House 1976–2024" dataset (CC0 —
 * public domain), hosted on Harvard Dataverse
 * (doi:10.7910/DVN/IG0UN2, file id 13592823, confirmed live). Needs a
 * Harvard Dataverse API token even though the DATA is public-domain: the
 * dataset has a "guestbook" response requirement Dataverse enforces on
 * every download (a usage-tracking survey, unrelated to licensing) that
 * has no anonymous/API bypass — a logged-in account's API token is the
 * only way to satisfy it non-interactively. See .env.example for how to
 * generate one.
 *
 * Column/value conventions below (district=0 for at-large, stage="gen"
 * for general elections, party lowercase, state_po = 2-letter code, votes
 * possibly split across multiple rows per candidate on a fusion ticket)
 * are confirmed against MEDSL's own published codebook for this dataset
 * series, not assumed.
 */

const DATAVERSE_FILE_URL = "https://dataverse.harvard.edu/api/access/datafile/13592823";

interface HouseReturnRow {
  year: string;
  state_po: string;
  district: string;
  office: string;
  stage: string;
  candidate: string;
  candidatevotes: string;
  totalvotes: string;
}

function parseTsv(text: string): HouseReturnRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const unquote = (cell: string) => cell.replace(/^"(.*)"$/, "$1");
  const header = lines[0].split("\t").map(unquote);
  return lines.slice(1).map((line) => {
    const cells = line.split("\t").map(unquote);
    const row: Record<string, string> = {};
    header.forEach((col, i) => {
      row[col] = cells[i] ?? "";
    });
    return row as unknown as HouseReturnRow;
  });
}

export function createHarvardDataverseAdapter(apiToken: string): ElectionResultsPort {
  return {
    async fetchLatestHouseResults(): Promise<RawElectionResult[]> {
      const res = await fetch(DATAVERSE_FILE_URL, { headers: { "X-Dataverse-key": apiToken } });
      if (!res.ok) {
        throw new Error(`Harvard Dataverse file request failed: ${res.status} ${res.statusText}`);
      }
      const rows = parseTsv(await res.text());

      const generalRows = rows.filter(
        (r) => r.office === "US House" && (r.stage === "gen" || r.stage === "") && r.state_po && r.district !== ""
      );
      if (generalRows.length === 0) return [];

      const latestYear = Math.max(...generalRows.map((r) => Number(r.year)));
      const latestRows = generalRows.filter((r) => Number(r.year) === latestYear);

      // Group by (state, district) -> candidate -> summed votes (fusion
      // tickets split one candidate's votes across multiple party-line
      // rows in the same race — sum before picking a winner).
      const byRace = new Map<string, { totalvotes: number; candidateVotes: Map<string, number> }>();
      for (const row of latestRows) {
        const key = `${row.state_po}-${row.district}`;
        const race = byRace.get(key) ?? { totalvotes: Number(row.totalvotes) || 0, candidateVotes: new Map() };
        const votes = Number(row.candidatevotes) || 0;
        race.candidateVotes.set(row.candidate, (race.candidateVotes.get(row.candidate) ?? 0) + votes);
        byRace.set(key, race);
      }

      const results: RawElectionResult[] = [];
      for (const [key, race] of byRace) {
        if (race.totalvotes <= 0 || race.candidateVotes.size === 0) continue;
        const [statePo, districtStr] = key.split("-");
        const districtNum = Number(districtStr);
        const winnerVotes = Math.max(...race.candidateVotes.values());

        results.push({
          state: statePo,
          chamber: "house",
          district: districtNum === 0 ? 1 : districtNum, // at-large -> our convention's district 1
          year: latestYear,
          winnerPct: Number(((winnerVotes / race.totalvotes) * 100).toFixed(1)),
        });
      }
      return results;
    },
  };
}
