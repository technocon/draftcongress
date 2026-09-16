import Link from "next/link";
import { notFound } from "next/navigation";
import { stateName } from "@/lib/us-states";
import { getStateDelegation } from "@/server/domain/charts/state-race-map";
import { StateFlag } from "@/components/state-flag";
import { StateDelegationView } from "@/components/charts/state-delegation-view";

export default async function CongressStatePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const stateCode = code.toUpperCase();
  const name = stateName(stateCode);
  if (!name) notFound();

  const delegation = await getStateDelegation(stateCode);

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
          One cell per House district, colored by incumbent party and shaded by competitiveness — simplified/schematic,
          not real district boundaries. Illustrative seeded data unless imported from congress.gov — see prisma/seed.ts.
        </p>
      </div>

      <div className="rc-card p-4">
        <StateDelegationView delegation={delegation} />
      </div>
    </div>
  );
}
