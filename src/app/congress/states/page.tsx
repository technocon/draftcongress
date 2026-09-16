import Link from "next/link";
import { US_STATES } from "@/lib/us-states";
import { StateFlag } from "@/components/state-flag";

export default function CongressStatesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-black">Congress by state</h1>
        <p className="text-sm text-[var(--color-ink-soft)] mt-1">
          Pick a state to see its House delegation (by district) and its 2 senators.
        </p>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-8 gap-2">
        {US_STATES.map((s) => (
          <Link
            key={s.code}
            href={`/congress/states/${s.code}`}
            className="rc-card p-2 flex flex-col items-center gap-1.5 hover:bg-blue-50 transition-colors"
          >
            <StateFlag code={s.code} size={32} />
            <span className="text-[11px] font-bold">{s.code}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
