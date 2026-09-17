import type { RaceRatingsPort } from "./port";
import { raceRatingsFixtureAdapter } from "./fixtures";
import { createDecisionLabsRatingsAdapter } from "./decision-labs";

export type { RaceRatingsPort, RawRaceRating, RaceRatingValue } from "./port";

/**
 * Returns the fixture adapter unless DECISION_LABS_RATINGS_ENABLED is set
 * to "true" — unlike the other adapters, this source needs no API key, so
 * an explicit boolean opt-in (not a key's mere presence) is the
 * activation signal, since it's a free/best-effort third-party API worth
 * turning on deliberately. See .env.example for the reasoning.
 */
export function getRaceRatingsAdapter(): RaceRatingsPort {
  if (process.env.DECISION_LABS_RATINGS_ENABLED !== "true") {
    return raceRatingsFixtureAdapter;
  }
  return createDecisionLabsRatingsAdapter();
}
