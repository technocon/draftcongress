/**
 * Shared party/rating color scheme for anything that renders one cell/dot
 * per seat colored by incumbent party and shaded by competitiveness —
 * currently the House/Senate hemicycle arc chart (race-arc-chart.tsx) and
 * the per-state district grid (state-district-grid.tsx). Kept in one place
 * so both stay visually consistent.
 */
export const PARTY_BASE: Record<string, string> = { D: "#2563eb", R: "#dc2626", I: "#7c3aed" };
export const RATING_FACTOR: Record<string, number> = { safe: 1, likely: 0.75, lean: 0.55, toss_up: 0.35 };
export const RATING_LABEL: Record<string, string> = { safe: "Safe", likely: "Likely", lean: "Lean", toss_up: "Toss-up" };

export function mixWithWhite(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (c: number) => Math.round(c * factor + 255 * (1 - factor));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

export function seatColor(party: string, rating: string): string {
  const base = PARTY_BASE[party] ?? "#6b7280";
  return mixWithWhite(base, RATING_FACTOR[rating] ?? 1);
}
