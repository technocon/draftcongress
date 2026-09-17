import type { RaceRatingsPort, RawRaceRating, RaceRatingValue } from "../port";

/**
 * decisionlabs.ai's free, no-auth API (confirmed live at
 * https://www.decisionlabs.ai/api/ratings/2026) — aggregates Cook
 * Political Report, Sabato's Crystal Ball, and Inside Elections ratings,
 * currently sourced from Wikipedia per the response's own
 * `source_status`/`note` metadata (their words: "pending automated
 * sourcing"). Covers Senate AND governor races only — confirmed live, no
 * House races present at all — so this only ever produces `chamber:
 * "senate"` results; House Race.rating stays illustrative until a
 * House-covering source is found.
 *
 * Each race carries three raters' values (`cook`, `sabato`,
 * `inside_elections`), each one of safe_r/safe_d, likely_r/likely_d,
 * lean_r/lean_d, or tossup. This adapter prefers `cook` (Cook Political
 * Report — the most widely cited single source), falling back to
 * `sabato` then `inside_elections` if Cook's value is missing for a race.
 */

const RATINGS_URL = "https://www.decisionlabs.ai/api/ratings/2026";

interface DecisionLabsRace {
  abbr: string;
  office: string;
  cook?: string;
  sabato?: string;
  inside_elections?: string;
}

interface DecisionLabsRatingsResponse {
  ratings: DecisionLabsRace[];
}

function normalizeRating(raw: string | undefined): RaceRatingValue | null {
  if (!raw) return null;
  if (raw.startsWith("safe")) return "safe";
  if (raw.startsWith("likely")) return "likely";
  if (raw.startsWith("lean")) return "lean";
  if (raw === "tossup") return "toss_up";
  return null;
}

export function createDecisionLabsRatingsAdapter(): RaceRatingsPort {
  return {
    async fetchCurrentCycleRatings(): Promise<RawRaceRating[]> {
      const res = await fetch(RATINGS_URL, { headers: { Accept: "application/json" } });
      if (!res.ok) {
        throw new Error(`decisionlabs.ai ratings request failed: ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as DecisionLabsRatingsResponse;

      const results: RawRaceRating[] = [];
      for (const race of data.ratings ?? []) {
        if (race.office !== "senate") continue;
        const rating = normalizeRating(race.cook) ?? normalizeRating(race.sabato) ?? normalizeRating(race.inside_elections);
        if (!rating) continue;
        results.push({ state: race.abbr, chamber: "senate", rating });
      }
      return results;
    },
  };
}
