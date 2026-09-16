/**
 * The 50 US states, for League "home state" identity (a cosmetic flag
 * picked at league creation — see prisma/schema.prisma's League.homeState
 * comment). Flag SVGs live in public/flags/{code}.svg, sourced from
 * Wikimedia-derived public-domain state flag artwork.
 */
export const US_STATES: Array<{ code: string; name: string }> = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
];

const BY_CODE = new Map(US_STATES.map((s) => [s.code, s.name]));
const CODE_BY_NAME = new Map(US_STATES.map((s) => [s.name, s.code]));

export function stateName(code: string | null | undefined): string | null {
  if (!code) return null;
  return BY_CODE.get(code) ?? null;
}

/** Maps a full state name (e.g. "Vermont", as congress.gov's API returns)
 * to its 2-letter code. Returns null for non-state entries (DC, Puerto
 * Rico, Guam, etc.) — those have no seat in HOUSE_SEATS_BY_STATE / this
 * 50-state list, by design (see us-house-apportionment.ts). */
export function codeForStateName(name: string | null | undefined): string | null {
  if (!name) return null;
  return CODE_BY_NAME.get(name) ?? null;
}
