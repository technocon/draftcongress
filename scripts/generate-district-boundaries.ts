/**
 * One-time (rerun-when-needed, e.g. after redistricting) generator, NOT
 * part of the app runtime: converts the U.S. Census Bureau's 119th
 * Congress cartographic boundary shapefile (public domain — 1:500,000
 * scale, pre-generalized for exactly this kind of map rendering, NOT the
 * full-resolution TIGER/Line files) into real per-district SVG paths,
 * grouped and locally projected per state, and writes ONE FILE PER STATE
 * to public/district-boundaries/{code}.json — not a single combined file
 * (that would bundle all 50 states' geometry, ~8MB, into a page that only
 * ever shows one state at a time), and not under src/lib (Next's
 * `output: "standalone"` build only copies node_modules/statically-
 * imported files into the deploy bundle — a dynamic fs.readFileSync of a
 * src/ file at runtime would silently 404 in production; public/ is
 * copied wholesale, same as the existing public/flags/*.svg). The page
 * component (src/app/congress/states/[code]/page.tsx) reads just the one
 * needed file server-side via fs and passes it down as a prop.
 *
 * Source file: https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_cd119_500k.zip
 * (download and unzip locally before running — not committed to the repo,
 * see README/this file's usage note below).
 *
 * Projection: each state gets its own simple equirectangular projection
 * (x scaled by cos(reference latitude) so degrees-longitude and
 * degrees-latitude render visually proportional at that state's latitude;
 * y negated so north is up) — not a real cartographic projection like
 * Albers, but states are small enough in extent that the distortion is
 * negligible, and this avoids needing a full projection library at
 * runtime. Districts within a state all share one projection/viewBox so
 * they align correctly against each other.
 *
 * Run with:
 *   curl -o /tmp/cd119.zip https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_cd119_500k.zip
 *   unzip /tmp/cd119.zip -d /tmp/cd119
 *   npx tsx scripts/generate-district-boundaries.ts /tmp/cd119/cb_2025_us_cd119_500k.shp
 */
import fs from "node:fs";
import path from "node:path";
import * as shapefile from "shapefile";
import type { Geometry, Position } from "geojson";
import { FIPS_TO_STATE_CODE } from "../src/lib/fips-codes";

interface DistrictFeature {
  stateCode: string;
  district: number; // 1-based; at-large (CD119FP "00") normalized to 1
  geometry: Geometry;
}

function ringsOfGeometry(geometry: Geometry): Position[][] {
  if (geometry.type === "Polygon") return geometry.coordinates as Position[][];
  if (geometry.type === "MultiPolygon") return (geometry.coordinates as Position[][][]).flat();
  return [];
}

async function loadDistricts(shpPath: string): Promise<DistrictFeature[]> {
  const dbfPath = shpPath.replace(/\.shp$/, ".dbf");
  const source = await shapefile.open(shpPath, dbfPath);
  const districts: DistrictFeature[] = [];

  for (;;) {
    const result = await source.read();
    if (result.done) break;
    const props = result.value.properties as { STATEFP: string; CD119FP: string };
    const stateCode = FIPS_TO_STATE_CODE[Number(props.STATEFP)];
    if (!stateCode) continue; // territory/DC delegate — no seat in our 50-state schema

    const districtNum = Number(props.CD119FP);
    districts.push({
      stateCode,
      district: districtNum === 0 ? 1 : districtNum, // at-large -> our convention's district 1
      geometry: result.value.geometry as Geometry,
    });
  }
  return districts;
}

function main() {
  const shpPath = process.argv[2];
  if (!shpPath) {
    console.error("Usage: npx tsx scripts/generate-district-boundaries.ts <path-to-cb_2025_us_cd119_500k.shp>");
    process.exit(1);
  }

  loadDistricts(shpPath).then((districts) => {
    const byState = new Map<string, DistrictFeature[]>();
    for (const d of districts) {
      const arr = byState.get(d.stateCode) ?? [];
      arr.push(d);
      byState.set(d.stateCode, arr);
    }

    const output: Record<
      string,
      { viewBoxWidth: number; viewBoxHeight: number; districts: { district: number; path: string }[] }
    > = {};

    for (const [stateCode, stateDistricts] of byState) {
      const allRings = stateDistricts.flatMap((d) => ringsOfGeometry(d.geometry));

      let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
      for (const ring of allRings) {
        for (const [lon, lat] of ring) {
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }
      const refLatRad = ((minLat + maxLat) / 2) * (Math.PI / 180);
      const xScale = Math.cos(refLatRad);

      const project = (lon: number, lat: number): [number, number] => [lon * xScale, -lat];

      let pMinX = Infinity, pMaxX = -Infinity, pMinY = Infinity, pMaxY = -Infinity;
      for (const ring of allRings) {
        for (const [lon, lat] of ring) {
          const [x, y] = project(lon, lat);
          if (x < pMinX) pMinX = x;
          if (x > pMaxX) pMaxX = x;
          if (y < pMinY) pMinY = y;
          if (y > pMaxY) pMaxY = y;
        }
      }
      const projectedWidth = pMaxX - pMinX || 1;
      const projectedHeight = pMaxY - pMinY || 1;
      const finalScale = 100 / projectedWidth;

      function pathFor(geometry: Geometry): string {
        return ringsOfGeometry(geometry)
          .map((ring) => {
            const pts = ring.map(([lon, lat]) => {
              const [x, y] = project(lon, lat);
              return `${((x - pMinX) * finalScale).toFixed(2)},${((y - pMinY) * finalScale).toFixed(2)}`;
            });
            return `M${pts[0]} L${pts.slice(1).join(" L")} Z`;
          })
          .join(" ");
      }

      output[stateCode] = {
        viewBoxWidth: 100,
        viewBoxHeight: Number((projectedHeight * finalScale).toFixed(2)),
        districts: stateDistricts
          .map((d) => ({ district: d.district, path: pathFor(d.geometry) }))
          .sort((a, b) => a.district - b.district),
      };
    }

    const outDir = path.join(__dirname, "../public/district-boundaries");
    fs.mkdirSync(outDir, { recursive: true });
    let totalBytes = 0;
    for (const [stateCode, stateData] of Object.entries(output)) {
      const outPath = path.join(outDir, `${stateCode}.json`);
      fs.writeFileSync(outPath, JSON.stringify(stateData));
      totalBytes += fs.statSync(outPath).size;
    }
    const districtCount = Object.values(output).reduce((sum, s) => sum + s.districts.length, 0);
    console.log(`Wrote ${Object.keys(output).length} state files / ${districtCount} districts to ${outDir} (${(totalBytes / 1024).toFixed(0)} KB total)`);
  });
}

main();
