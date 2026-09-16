"use client";

import { useState } from "react";
import { US_STATES } from "@/lib/us-states";

/**
 * The "select your team" grid, mock-draft-simulator style — a flag per US
 * state instead of an NFL team logo. Feeds a hidden `name="homeState"`
 * input so it works inside a plain server-action `<form>` with no client
 * state lifted to the parent.
 */
export function StateFlagPicker({ defaultValue }: { defaultValue?: string }) {
  const [selected, setSelected] = useState<string | undefined>(defaultValue);

  return (
    <div>
      <input type="hidden" name="homeState" value={selected ?? ""} required />
      <div className="grid grid-cols-5 sm:grid-cols-8 gap-1.5 max-h-56 overflow-y-auto p-1 border border-[var(--color-border)] rounded-lg bg-[var(--color-bg)]">
        {US_STATES.map((s) => {
          const isSelected = selected === s.code;
          return (
            <button
              key={s.code}
              type="button"
              title={s.name}
              onClick={() => setSelected(s.code)}
              className={`flex flex-col items-center gap-1 rounded-md p-1.5 transition-colors ${
                isSelected ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-card)] hover:bg-blue-50 text-[var(--color-ink-soft)]"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- static /public asset */}
              <img src={`/flags/${s.code}.svg`} alt="" width={28} height={18} className="rounded-sm object-cover shadow-sm" style={{ width: 28, height: 18 }} />
              <span className="text-[10px] font-bold leading-none">{s.code}</span>
            </button>
          );
        })}
      </div>
      {selected && <p className="text-xs text-[var(--color-ink-soft)] mt-1">Selected: {US_STATES.find((s) => s.code === selected)?.name}</p>}
    </div>
  );
}
