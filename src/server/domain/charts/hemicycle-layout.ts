export interface Point {
  x: number;
  y: number;
}

/**
 * Classic concentric-arc "parliament chart" seat layout: n points arranged
 * across a semicircle in rows whose radius grows outward, with roughly
 * even spacing between seats within and between rows (outer rows hold
 * more seats since their arc is longer). Pure/deterministic — same input,
 * same output — so it can run at request time with no caching needed.
 *
 * Units are arbitrary (not pixels); the chart component scales the whole
 * point cloud to fit its viewport.
 */
export function computeHemicycleLayout(n: number, dotRadius = 1): Point[] {
  if (n <= 0) return [];

  const seatSpacing = dotRadius * 2.3;
  const rowGap = dotRadius * 2.6;

  const rowSeatCounts: number[] = [];
  const rowRadii: number[] = [];
  let radius = dotRadius * 6;
  let capacity = 0;

  while (capacity < n) {
    const circumference = Math.PI * radius;
    const seatsInRow = Math.max(1, Math.round(circumference / seatSpacing));
    rowSeatCounts.push(seatsInRow);
    rowRadii.push(radius);
    capacity += seatsInRow;
    radius += rowGap;
  }

  // Trim the excess evenly off the outermost rows first, so the
  // innermost rows (which read most clearly) stay fully populated.
  let excess = capacity - n;
  for (let i = rowSeatCounts.length - 1; i >= 0 && excess > 0; i--) {
    const reduce = Math.min(excess, rowSeatCounts[i] - 1);
    rowSeatCounts[i] -= reduce;
    excess -= reduce;
  }

  const points: Point[] = [];
  rowSeatCounts.forEach((count, rowIndex) => {
    const r = rowRadii[rowIndex];
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const angle = Math.PI * (1 - t); // sweeps π (left) → 0 (right)
      points.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
    }
  });

  return points.slice(0, n);
}
