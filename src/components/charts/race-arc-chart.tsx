"use client";

import { useMemo, useState } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./echart";
import type { RaceDetail } from "@/server/domain/charts/race-map";
import { StateFlag } from "@/components/state-flag";

const PARTY_BASE: Record<string, string> = { D: "#2563eb", R: "#dc2626", I: "#7c3aed" };
const RATING_FACTOR: Record<string, number> = { safe: 1, likely: 0.75, lean: 0.55, toss_up: 0.35 };
const RATING_LABEL: Record<string, string> = { safe: "Safe", likely: "Likely", lean: "Lean", toss_up: "Toss-up" };

function mixWithWhite(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (c: number) => Math.round(c * factor + 255 * (1 - factor));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

function raceColor(race: RaceDetail): string {
  const base = PARTY_BASE[race.party] ?? "#6b7280";
  return mixWithWhite(base, RATING_FACTOR[race.rating] ?? 1);
}

/**
 * The House/Senate "arc chart" (SRD's House/Senate breakdown, styled after
 * BBC/AP-style hemicycle race maps): one dot per seat, positioned by
 * server-computed hemicycle layout (hemicycle-layout.ts) and colored by
 * incumbent party at a lightness set by the race's competitiveness rating
 * — pale for a toss-up, solid for safe. Clicking a dot drills into
 * whatever we actually have on that seat (see race-map.ts's comment on
 * why that's "existing data only," not real demographics).
 */
export function RaceArcChart({ chamberName, races }: { chamberName: string; races: RaceDetail[] }) {
  const [selected, setSelected] = useState<RaceDetail | null>(null);

  // Computed once per `races` (not per selection) so the locked aspect
  // ratio passed to EChart below stays in sync with the axis spans set
  // in `option` — both must derive from the same extent or the hemicycle
  // still distorts.
  const { maxAbsX, maxY } = useMemo(() => {
    const xs = races.map((r) => r.x);
    const ys = races.map((r) => r.y);
    return { maxAbsX: Math.max(1, ...xs.map(Math.abs)), maxY: Math.max(1, ...ys) };
  }, [races]);
  const xSpan = maxAbsX * 2.16;
  const ySpan = maxY * 1.22;

  const option: EChartsOption = useMemo(() => {
    return {
      tooltip: {
        trigger: "item",
        formatter: (p) => {
          const race = races[(p as { dataIndex: number }).dataIndex];
          return `${race.seatLabel}<br/>${race.party} · ${RATING_LABEL[race.rating] ?? race.rating}${
            race.incumbent ? `<br/>${race.incumbent.fullName}` : ""
          }`;
        },
      },
      grid: { left: 0, right: 0, top: 8, bottom: 0 },
      xAxis: { type: "value", min: -maxAbsX * 1.08, max: maxAbsX * 1.08, show: false },
      yAxis: { type: "value", min: -maxY * 0.12, max: maxY * 1.1, show: false },
      series: [
        {
          type: "scatter",
          symbolSize: races.length > 300 ? 9 : 16,
          data: races.map((race) => ({
            value: [race.x, race.y],
            itemStyle: {
              color: raceColor(race),
              borderColor: selected?.id === race.id ? "var(--color-ink, #1a1a1a)" : "transparent",
              borderWidth: selected?.id === race.id ? 2 : 0,
            },
          })),
        },
      ],
    };
  }, [races, selected, maxAbsX, maxY]);

  return (
    <div className="flex flex-col gap-3">
      <EChart
        option={option}
        aspectRatio={xSpan / ySpan}
        onEvents={{
          click: (params) => {
            const dataIndex = (params as { dataIndex: number }).dataIndex;
            setSelected(races[dataIndex] ?? null);
          },
        }}
      />

      <div className="flex items-center gap-4 text-xs text-[var(--color-ink-soft)]">
        <span className="font-medium text-[var(--color-ink)]">{chamberName}</span>
        <LegendSwatch color={PARTY_BASE.D} label="Dem." />
        <LegendSwatch color={PARTY_BASE.R} label="Rep." />
        <span>· pale = closer race</span>
      </div>

      {selected && (
        <div className="rc-card p-4 text-sm">
          <div className="flex items-start justify-between">
            <div>
              <p className="section-label">
                {selected.seatLabel} · {selected.cycle}
              </p>
              <p className="text-[var(--color-ink-soft)] mt-0.5">
                {selected.party === "D" ? "Democratic" : selected.party === "R" ? "Republican" : selected.party}
                {" · "}
                {RATING_LABEL[selected.rating] ?? selected.rating}
              </p>
            </div>
            <button onClick={() => setSelected(null)} className="text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]">
              Close ✕
            </button>
          </div>

          {selected.incumbent ? (
            <div className="mt-3 flex flex-col gap-2">
              <p className="headline-link text-base">{selected.incumbent.fullName}</p>
              <p className="text-[var(--color-ink-soft)] flex items-center gap-1.5">
                <StateFlag code={selected.incumbent.state} size={18} />
                {selected.incumbent.state}
                {selected.incumbent.district ? ` · District ${selected.incumbent.district}` : ""}
              </p>

              {selected.incumbent.blocs.length > 0 && (
                <div>
                  <p className="text-xs section-label mb-1">Caucus / bloc membership</p>
                  <p className="text-[var(--color-ink-soft)]">{selected.incumbent.blocs.map((b) => b.name).join(", ")}</p>
                </div>
              )}

              {selected.incumbent.recentScoringEvents.length > 0 ? (
                <div>
                  <p className="text-xs section-label mb-1">Recent scoring events</p>
                  <ul className="flex flex-col gap-0.5">
                    {selected.incumbent.recentScoringEvents.map((e, i) => (
                      <li key={i} className="text-[var(--color-ink-soft)]">
                        {new Date(e.occurredAt).toLocaleDateString()} · {e.eventType.replace(/_/g, " ")} ·{" "}
                        {e.pointsAwarded > 0 ? "+" : ""}
                        {e.pointsAwarded}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-[var(--color-ink-soft)]">No scoring events recorded for this member yet.</p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-[var(--color-ink-soft)]">
              No detailed legislator record seeded for this seat in Phase 1 reference data.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function LegendSwatch({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
