/**
 * U.S. House seats per state under the 2020 census apportionment (in effect
 * for the 2022–2030 election cycles). Drives how many District Race rows
 * (prisma/seed.ts) and district-grid cells (state district map) each state
 * gets — a state with 1 seat is "at-large" rather than "District 1" in
 * seatLabel/UI text, but is still stored as district = 1.
 *
 * Sums to 435. Source: U.S. Census Bureau 2020 apportionment results.
 */
export const HOUSE_SEATS_BY_STATE: Record<string, number> = {
  AL: 7, AK: 1, AZ: 9, AR: 4, CA: 52, CO: 8, CT: 5, DE: 1, FL: 28, GA: 14,
  HI: 2, ID: 2, IL: 17, IN: 9, IA: 4, KS: 4, KY: 6, LA: 6, ME: 2, MD: 8,
  MA: 9, MI: 13, MN: 8, MS: 4, MO: 8, MT: 2, NE: 3, NV: 4, NH: 2, NJ: 12,
  NM: 3, NY: 26, NC: 14, ND: 1, OH: 15, OK: 5, OR: 6, PA: 17, RI: 2, SC: 7,
  SD: 1, TN: 9, TX: 38, UT: 4, VT: 1, VA: 11, WA: 10, WV: 2, WI: 8, WY: 1,
};

export function isAtLarge(stateCode: string): boolean {
  return HOUSE_SEATS_BY_STATE[stateCode] === 1;
}

export function houseDistrictLabel(stateCode: string, district: number): string {
  return isAtLarge(stateCode) ? `${stateCode} At-Large` : `${stateCode}-${district}`;
}
