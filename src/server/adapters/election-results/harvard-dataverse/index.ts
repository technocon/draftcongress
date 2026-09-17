import fs from "node:fs";
import type { ElectionResultsPort, RawElectionResult } from "../port";

/**
 * MIT Election Data + Science Lab's "U.S. House 1976–2024" dataset (CC0 —
 * public domain), hosted on Harvard Dataverse
 * (doi:10.7910/DVN/IG0UN2, file id 13592823, confirmed live). Needs a
 * Harvard Dataverse API token even though the DATA is public-domain: the
 * dataset has a "guestbook" response requirement Dataverse enforces on
 * every download (a usage-tracking survey, unrelated to licensing). An
 * API token alone does NOT bypass it — confirmed live: the token's
 * account must have submitted the guestbook form via the web UI at least
 * once for this specific dataset before the API honors that token's
 * downloads of it. createLocalFileAdapter below exists for exactly this
 * case — a guestbook response submitted via the browser, with the
 * resulting file downloaded by hand and pointed at directly, same data.
 *
 * Despite the ".tab" filename, the actual export is COMMA-separated (0
 * literal tabs, confirmed) with real quoted fields (candidate names
 * containing commas, e.g. "SMITH, JR.") — needs a real CSV parser, not a
 * naive split. Column VALUES are upper-case in this export
 * ("US HOUSE"/"GEN"/"DEMOCRAT") — this differs from MEDSL's own codebook,
 * which documents lower-case values for an earlier dataset vintage;
 * matched against the actual downloaded file, not the docs.
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

/** Minimal RFC4180-ish CSV line splitter: handles quoted fields with
 * embedded commas and "" as an escaped quote. Good enough for this one
 * well-formed dataset export, not a general-purpose CSV library. */
function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += c;
    }
  }
  cells.push(cell);
  return cells;
}

function parseCsv(text: string): HouseReturnRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((col, i) => {
      row[col] = cells[i] ?? "";
    });
    return row as unknown as HouseReturnRow;
  });
}

/** Shared by both the live-fetch and local-file adapters below — the
 * parsing/aggregation logic is identical either way, only the source of
 * the raw CSV text differs. */
function resultsFromCsvText(text: string): RawElectionResult[] {
  const rows = parseCsv(text);

  const generalRows = rows.filter(
    (r) => r.office === "US HOUSE" && (r.stage === "GEN" || r.stage === "") && r.state_po && r.district !== ""
  );
  if (generalRows.length === 0) return [];

  const latestYear = Math.max(...generalRows.map((r) => Number(r.year)));
  const latestRows = generalRows.filter((r) => Number(r.year) === latestYear);

  // Group by (state, district) -> candidate -> summed votes (fusion
  // tickets split one candidate's votes across multiple party-line rows
  // in the same race — sum before picking a winner).
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
}

export function createHarvardDataverseAdapter(apiToken: string): ElectionResultsPort {
  return {
    async fetchLatestHouseResults(): Promise<RawElectionResult[]> {
      const res = await fetch(DATAVERSE_FILE_URL, { headers: { "X-Dataverse-key": apiToken } });
      if (!res.ok) {
        throw new Error(`Harvard Dataverse file request failed: ${res.status} ${res.statusText}`);
      }
      return resultsFromCsvText(await res.text());
    },
  };
}

/** For a copy of 1976-2024-house.tab downloaded by hand through the
 * browser (after submitting the dataset's guestbook form there) — see
 * scripts/import-election-results.ts, which accepts a local path as its
 * first CLI arg and uses this instead of the live-fetch adapter. */
export function createLocalFileAdapter(filePath: string): ElectionResultsPort {
  return {
    async fetchLatestHouseResults(): Promise<RawElectionResult[]> {
      return resultsFromCsvText(fs.readFileSync(filePath, "utf8"));
    },
  };
}
