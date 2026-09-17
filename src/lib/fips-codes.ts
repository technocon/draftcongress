/**
 * Standard 2-digit Census FIPS state codes, keyed by numeric value (so
 * both zero-padded "06" and bare 6 from different data sources compare
 * equal via Number(...)). Shared by scripts/generate-state-district-
 * layouts.ts and scripts/generate-district-boundaries.ts — both consume
 * Census-derived geographic data that identifies states by FIPS code
 * rather than USPS 2-letter code.
 */
export const FIPS_TO_STATE_CODE: Record<number, string> = {
  1: "AL", 2: "AK", 4: "AZ", 5: "AR", 6: "CA", 8: "CO", 9: "CT", 10: "DE",
  12: "FL", 13: "GA", 15: "HI", 16: "ID", 17: "IL", 18: "IN", 19: "IA",
  20: "KS", 21: "KY", 22: "LA", 23: "ME", 24: "MD", 25: "MA", 26: "MI",
  27: "MN", 28: "MS", 29: "MO", 30: "MT", 31: "NE", 32: "NV", 33: "NH",
  34: "NJ", 35: "NM", 36: "NY", 37: "NC", 38: "ND", 39: "OH", 40: "OK",
  41: "OR", 42: "PA", 44: "RI", 45: "SC", 46: "SD", 47: "TN", 48: "TX",
  49: "UT", 50: "VT", 51: "VA", 53: "WA", 54: "WV", 55: "WI", 56: "WY",
};
