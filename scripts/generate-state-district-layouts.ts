/**
 * One-time (rerun-when-needed) generator, NOT part of the app runtime: pre-
 * computes a per-state district "cartogram" layout — N points scattered
 * inside that state's real outline (N = HOUSE_SEATS_BY_STATE[code]) plus
 * the outline itself as an SVG path — and writes it to
 * src/lib/state-district-layouts.json. state-delegation-view.tsx just
 * zips a state's districts (sorted by number) with this precomputed point
 * array and renders small squares at those positions over the outline,
 * the same "precomputed layout, zip with data" pattern
 * src/server/domain/charts/hemicycle-layout.ts uses for the House/Senate
 * arc chart.
 *
 * Source geometry: us-atlas's states-albers-10m.json (derived from Census
 * TIGER data, public domain) — the ALREADY-PROJECTED Albers-USA composite
 * used by D3's canonical US-map examples, where Alaska/Hawaii are
 * pre-repositioned as normal finite-bounds insets. That sidesteps the
 * antimeridian-wraparound bug a raw lon/lat dataset has for Alaska, and
 * means containment testing is a plain 2D ray-cast (no spherical geometry
 * library needed) since the coordinates are already Cartesian.
 *
 * Run with: npx tsx scripts/generate-state-district-layouts.ts
 */
import fs from "node:fs";
import path from "node:path";
import * as topojson from "topojson-client";
import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import { HOUSE_SEATS_BY_STATE } from "../src/lib/us-house-apportionment";

// Standard 2-digit Census FIPS state codes.
const FIPS_TO_CODE: Record<number, string> = {
  1: "AL", 2: "AK", 4: "AZ", 5: "AR", 6: "CA", 8: "CO", 9: "CT", 10: "DE",
  12: "FL", 13: "GA", 15: "HI", 16: "ID", 17: "IL", 18: "IN", 19: "IA",
  20: "KS", 21: "KY", 22: "LA", 23: "ME", 24: "MD", 25: "MA", 26: "MI",
  27: "MN", 28: "MS", 29: "MO", 30: "MT", 31: "NE", 32: "NV", 33: "NH",
  34: "NJ", 35: "NM", 36: "NY", 37: "NC", 38: "ND", 39: "OH", 40: "OK",
  41: "OR", 42: "PA", 44: "RI", 45: "SC", 46: "SD", 47: "TN", 48: "TX",
  49: "UT", 50: "VT", 51: "VA", 53: "WA", 54: "WV", 55: "WI", 56: "WY",
};

type Ring = Position[];

function ringsOfGeometry(geometry: Geometry): Ring[] {
  if (geometry.type === "Polygon") return geometry.coordinates as Ring[];
  if (geometry.type === "MultiPolygon") return (geometry.coordinates as Ring[][]).flat();
  return [];
}

/** True if a polygon (possibly with holes) contains [x, y] — standard ray-cast,
 * even-odd rule: crossing an odd number of ring boundaries means inside, and
 * this naturally handles holes since a hole ring toggles the parity back off. */
function pointInRings(x: number, y: number, rings: Ring[]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersects) inside = !inside;
    }
  }
  return inside;
}

function boundsOf(rings: Ring[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Scatters up to `count` points inside the polygon, oversampling a
 * candidate grid and increasing resolution until enough land inside
 * (falls back to a plain bounding-box grid if a state is too thin/small
 * for any resolution tried to find enough interior points). */
function scatterPoints(rings: Ring[], count: number, bounds: ReturnType<typeof boundsOf>): Position[] {
  const { minX, minY, maxX, maxY } = bounds;
  const width = maxX - minX || 1;
  const height = maxY - minY || 1;
  const aspect = width / height;

  for (const oversample of [4, 8, 14, 22]) {
    const cols = Math.max(2, Math.round(Math.sqrt(count * oversample * aspect)));
    const rows = Math.max(2, Math.round(cols / aspect));
    const candidates: Position[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = minX + ((c + 0.5) / cols) * width;
        const y = minY + ((r + 0.5) / rows) * height;
        if (pointInRings(x, y, rings)) candidates.push([x, y]);
      }
    }
    if (candidates.length >= count) {
      // Reading order (top of screen first — Albers Y increases southward
      // like screen Y, confirmed visually against a rendered sample) then
      // evenly sampled down to exactly `count` so the pick still spans the
      // full shape rather than clustering in one corner.
      candidates.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      if (count === 1) return [candidates[Math.floor(candidates.length / 2)]];
      const picked: Position[] = [];
      for (let i = 0; i < count; i++) {
        const idx = Math.round((i * (candidates.length - 1)) / (count - 1));
        picked.push(candidates[idx]);
      }
      return picked;
    }
  }

  // Fallback: a plain grid over the bounding box (no containment test) —
  // only expected for degenerate/very thin shapes at tiny district counts.
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const fallback: Position[] = [];
  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    fallback.push([minX + ((c + 0.5) / cols) * width, minY + ((r + 0.5) / rows) * height]);
  }
  return fallback;
}

function buildOutlinePath(rings: Ring[], scale: number, minX: number, minY: number): string {
  return rings
    .map((ring) => {
      const points = ring.map(([x, y]) => `${((x - minX) * scale).toFixed(2)},${((y - minY) * scale).toFixed(2)}`);
      return `M${points[0]} L${points.slice(1).join(" L")} Z`;
    })
    .join(" ");
}

function main() {
  const topoPath = require.resolve("us-atlas/states-albers-10m.json");
  const topology = JSON.parse(fs.readFileSync(topoPath, "utf8"));
  const collection = topojson.feature(topology, topology.objects.states) as unknown as FeatureCollection;

  const output: Record<
    string,
    { viewBoxWidth: number; viewBoxHeight: number; outline: string; points: { x: number; y: number }[] }
  > = {};

  for (const [code, seatCount] of Object.entries(HOUSE_SEATS_BY_STATE)) {
    const fips = Object.entries(FIPS_TO_CODE).find(([, c]) => c === code)?.[0];
    if (!fips) throw new Error(`No FIPS code mapped for ${code}`);
    const feature = collection.features.find((f: Feature) => Number(f.id) === Number(fips));
    if (!feature) throw new Error(`No us-atlas feature found for ${code} (FIPS ${fips})`);

    const rings = ringsOfGeometry(feature.geometry);
    const bounds = boundsOf(rings);
    const width = bounds.maxX - bounds.minX || 1;
    const height = bounds.maxY - bounds.minY || 1;

    const points = scatterPoints(rings, seatCount, bounds);

    // Normalize to a viewBox with width fixed at 100, height proportional
    // to the state's true aspect ratio (so shapes aren't stretched).
    const scale = 100 / width;
    const viewBoxWidth = 100;
    const viewBoxHeight = height * scale;

    output[code] = {
      viewBoxWidth,
      viewBoxHeight,
      outline: buildOutlinePath(rings, scale, bounds.minX, bounds.minY),
      points: points.map(([x, y]) => ({
        x: Number(((x - bounds.minX) * scale).toFixed(2)),
        y: Number(((y - bounds.minY) * scale).toFixed(2)),
      })),
    };
  }

  const outPath = path.join(__dirname, "../src/lib/state-district-layouts.json");
  fs.writeFileSync(outPath, JSON.stringify(output));
  console.log(`Wrote ${Object.keys(output).length} state layouts to ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);
}

main();
