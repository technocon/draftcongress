import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { notFound } from "next/navigation";
import { stateName } from "@/lib/us-states";
import { getStateDelegation } from "@/server/domain/charts/state-race-map";
import { StateFlag } from "@/components/state-flag";
import { StateDelegationView, type StateBoundaryData } from "@/components/charts/state-delegation-view";

/**
 * Reads the one state's precomputed real-district-boundary file (see
 * scripts/generate-district-boundaries.ts) server-side via fs rather than
 * a static import, so only the requested state's geometry (tens to a few
 * hundred KB) is ever sent down for this page — not all 50 states'
 * combined ~8MB.
 */
function loadBoundaries(stateCode: string): StateBoundaryData | null {
  try {
    const filePath = path.join(process.cwd(), "public/district-boundaries", `${stateCode}.json`);
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as StateBoundaryData;
  } catch {
    return null;
  }
}

export default async function CongressStatePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ upOnly?: string }>;
}) {
  const { code } = await params;
  const { upOnly: upOnlyParam } = await searchParams;
  const upOnly = upOnlyParam === "true";
  const stateCode = code.toUpperCase();
  const name = stateName(stateCode);
  if (!name) notFound();

  const [delegation, boundaries] = await Promise.all([
    getStateDelegation(stateCode, "2026", upOnly),
    Promise.resolve(loadBoundaries(stateCode)),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/congress/states" className="text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]">
          ← All states
        </Link>
        <div className="flex items-center gap-3 mt-1">
          <StateFlag code={stateCode} size={36} />
          <h1 className="text-2xl font-black">{name}</h1>
        </div>
        <p className="text-sm text-[var(--color-ink-soft)] mt-1">
          Real House district boundaries (U.S. Census Bureau, 119th Congress cartographic boundary files), colored by
          incumbent party and shaded by competitiveness. Illustrative party/rating data unless imported from
          congress.gov — see prisma/seed.ts.
        </p>
      </div>

      <div className="rc-card p-4">
        <StateDelegationView delegation={delegation} boundaries={boundaries} />
      </div>
    </div>
  );
}
