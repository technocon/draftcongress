import { prisma } from "@/server/db/client";
import { getChamberPartyBreakdown, getChamberBlocBreakdown } from "@/server/domain/charts/chamber-composition";
import { ChamberPartyChart } from "@/components/charts/chamber-party-chart";
import { ChamberBlocChart } from "@/components/charts/chamber-bloc-chart";

/**
 * Reference-data dashboard — House/Senate party and caucus/bloc
 * composition. Not tied to any league or season (this is all reference
 * data, no RLS — see prisma/schema.prisma's "Reference/content data"
 * section), so it's reachable without a league context.
 */
export default async function CongressPage() {
  const chambers = await prisma.chamber.findMany({ orderBy: { name: "asc" } });

  const chamberData = await Promise.all(
    chambers.map(async (chamber) => ({
      chamber,
      party: await getChamberPartyBreakdown(chamber.id),
      blocs: await getChamberBlocBreakdown(chamber.id),
    }))
  );

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-2xl font-semibold">Congress</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Party and caucus composition of the seeded reference data — not real current membership, see prisma/seed.ts.
        </p>
      </div>

      {chamberData.map(({ chamber, party, blocs }) => (
        <section key={chamber.id} className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">
            {chamber.name} <span className="text-sm text-neutral-500 font-normal">({chamber.totalSeats} seats)</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-2">
              <ChamberPartyChart title="Party composition" data={party} />
            </div>
            <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-2">
              <ChamberBlocChart title="Caucus / bloc membership" data={blocs} />
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
