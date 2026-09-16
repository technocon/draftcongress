import { prisma } from "@/server/db/client";
import { getChamberRaceMap } from "@/server/domain/charts/race-map";
import { RaceArcChart } from "@/components/charts/race-arc-chart";

/**
 * Reference-data dashboard — House/Senate seat-by-seat race map. Not tied
 * to any league or season (this is all reference data, no RLS — see
 * prisma/schema.prisma's "Reference/content data" section), so it's
 * reachable without a league context.
 */
export default async function CongressPage() {
  const chambers = await prisma.chamber.findMany({ orderBy: { name: "asc" } });

  const chamberData = await Promise.all(
    chambers.map(async (chamber) => ({
      chamber,
      races: await getChamberRaceMap(chamber.id),
    }))
  );

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-black">Congress</h1>
        <p className="text-sm text-[var(--color-ink-soft)] mt-1">
          One dot per seat, colored by incumbent party and shaded by how competitive the race is — click a seat for
          what we have on it. Illustrative seeded data, not a real race-ratings feed — see prisma/seed.ts.
        </p>
      </div>

      {chamberData.map(({ chamber, races }) => (
        <section key={chamber.id} className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold border-b-2 border-[var(--color-accent)] pb-2">
            {chamber.name} <span className="text-sm text-[var(--color-ink-soft)] font-normal">({chamber.totalSeats} seats)</span>
          </h2>
          <div className="rc-card p-4">
            <RaceArcChart chamberName={chamber.name} races={races} />
          </div>
        </section>
      ))}
    </div>
  );
}
