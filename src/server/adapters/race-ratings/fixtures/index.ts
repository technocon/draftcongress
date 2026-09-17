import type { RaceRatingsPort, RawRaceRating } from "../port";
import ratingsRaw from "./data/ratings.json";

/**
 * Fixture-backed RaceRatingsPort implementation — the default unless
 * DECISION_LABS_RATINGS_ENABLED is explicitly set (see ../index.ts's
 * factory). A couple of illustrative seats, same spirit as the other
 * reference-data fixtures.
 */
export const raceRatingsFixtureAdapter: RaceRatingsPort = {
  async fetchCurrentCycleRatings(): Promise<RawRaceRating[]> {
    return ratingsRaw as RawRaceRating[];
  },
};
