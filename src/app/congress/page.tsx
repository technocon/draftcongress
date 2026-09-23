import Link from "next/link";
import { prisma } from "@/server/db/client";
import { getChamberRaceMap } from "@/server/domain/charts/race-map";
import { RaceArcChart } from "@/components/charts/race-arc-chart";

/**
 * Reference-data dashboard — House/Senate seat-by-seat race map. Not tied
 * to any league or season (this is all reference data, no RLS — see
 * prisma/schema.prisma's "Reference/content data" section), so it's
 * reachable without a league context. A league's page links here with
 * `chamber`/`upOnly` pre-set to match that league's chamberScope — see
 * src/app/leagues/[leagueId]/page.tsx.
 */
export default async function CongressPage({
  searchParams,
}: {
  searchParams: Promise<{ chamber?: string; upOnly?: string }>;
}) {
  const { chamber: chamberParam, upOnly: upOnlyParam } = await searchParams;
  const chamberFilter = chamberParam === "house" || chamberParam === "senate" ? chamberParam : "all";
  const upOnly = upOnlyParam === "true";

  const allChambers = await prisma.chamber.findMany({ orderBy: { name: "asc" } });
  const chambers = allChambers.filter((c) => {
    if (chamberFilter === "house") return c.name === "U.S. House of Representatives";
    if (chamberFilter === "senate") return c.name === "U.S. Senate";
    return true;
  });

  const chamberData = await Promise.all(
    chambers.map(async (chamber) => ({
      chamber,
      // upOnly only ever narrows the Senate — see getChamberRaceMap's comment.
      races: await getChamberRaceMap(chamber.id, "2026", upOnly && chamber.name === "U.S. Senate"),
    }))
  );

  return (
    <div className="flex flex-col gap-10">
      <div>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-black">Congress</h1>
          <Link href="/congress/states" className="headline-link text-sm">
            Browse by state →
          </Link>
        </div>
        <p className="text-sm text-[var(--color-ink-soft)] mt-1">
          One dot per seat, colored by incumbent party and shaded by how competitive the race is — click a seat for
          what we have on it. Illustrative seeded data, not a real race-ratings feed — see prisma/seed.ts.
        </p>
        {(chamberFilter !== "all" || upOnly) && (
          <p className="text-xs text-[var(--color-ink-soft)] mt-1">
            Showing {chamberFilter === "all" ? "all chambers" : chamberFilter} {upOnly && "· Senate seats up this cycle only"} —{" "}
            <Link href="/congress" className="headline-link">
              clear filter
            </Link>
          </p>
        )}
      </div>

      {chamberData.map(({ chamber, races }) => (
        <section key={chamber.id} className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold border-b-2 border-[var(--color-accent)] pb-2">
            {chamber.name}{" "}
            <span className="text-sm text-[var(--color-ink-soft)] font-normal">
              ({races.length} {upOnly && chamber.name === "U.S. Senate" ? "up this cycle" : "seats"})
            </span>
          </h2>
          <div className="rc-card p-4">
            <RaceArcChart chamberName={chamber.name} races={races} />
          </div>
        </section>
      ))}
    </div>
  );
}
