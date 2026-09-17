// The `shapefile` package ships no types and has no @types package.
// Minimal ambient declaration for the one function this repo's generator
// script (generate-district-boundaries.ts) actually uses.
declare module "shapefile" {
  import type { Geometry } from "geojson";

  export interface ShapefileFeature {
    type: "Feature";
    properties: Record<string, unknown>;
    geometry: Geometry;
  }

  export interface ShapefileSource {
    read(): Promise<{ done: boolean; value: ShapefileFeature }>;
  }

  export function open(shpPath: string, dbfPath?: string): Promise<ShapefileSource>;
}
