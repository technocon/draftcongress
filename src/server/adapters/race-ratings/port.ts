export type RaceRatingValue = "safe" | "likely" | "lean" | "toss_up";

/** One race's real competitiveness rating. */
export interface RawRaceRating {
  state: string; // 2-letter USPS code
  chamber: "senate"; // House isn't covered by any source found yet — see the real adapter's comment
  rating: RaceRatingValue;
}

/**
 * The boundary between the race-ratings import script and any upstream
 * provider of real race-competitiveness ratings. Real and fixture
 * implementations satisfy this same shape — see ./index.ts's
 * getRaceRatingsAdapter().
 */
export interface RaceRatingsPort {
  fetchCurrentCycleRatings(): Promise<RawRaceRating[]>;
}
