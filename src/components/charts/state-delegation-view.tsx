"use client";

import { useState } from "react";
import type { StateDelegation, StateSeatDetail } from "@/server/domain/charts/state-race-map";
import { RATING_LABEL, seatColor } from "./party-colors";
import stateDistrictLayouts from "@/lib/state-district-layouts.json";

interface StateLayout {
  viewBoxWidth: number;
  viewBoxHeight: number;
  outline: string;
  points: { x: number; y: number }[];
}

/**
 * A state's congressional delegation, tabbed House/Senate. House renders as
 * a schematic district "cartogram": real district count scattered inside
 * that state's real outline shape (src/lib/state-district-layouts.json,
 * precomputed by scripts/generate-state-district-layouts.ts from Census
 * boundary data) — NOT real per-district geographic boundaries, just real
 * count + real outer silhouette. Senate renders as two seat cards since
 * senators are elected statewide, with no districts to subdivide.
 */
export function StateDelegationView({ stateCode, delegation }: { stateCode: string; delegation: StateDelegation }) {
  const [chamber, setChamber] = useState<"house" | "senate">("house");
  const [selected, setSelected] = useState<StateSeatDetail | null>(null);

  function selectChamber(next: "house" | "senate") {
    setChamber(next);
    setSelected(null);
  }

  const seats = chamber === "house" ? delegation.house : delegation.senate;

  return (
    <div className="flex flex-col gap-4">
      <div className="tab-group max-w-xs">
        <button className={`tab ${chamber === "house" ? "tab-active" : ""}`} onClick={() => selectChamber("house")}>
          House ({delegation.house.length})
        </button>
        <button className={`tab ${chamber === "senate" ? "tab-active" : ""}`} onClick={() => selectChamber("senate")}>
          Senate ({delegation.senate.length})
        </button>
      </div>

      {seats.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-soft)]">No seats seeded for this chamber/state.</p>
      ) : chamber === "house" ? (
        <DistrictGrid stateCode={stateCode} seats={seats} selectedId={selected?.id ?? null} onSelect={setSelected} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {seats.map((seat) => (
            <SeatTile key={seat.id} seat={seat} isSelected={selected?.id === seat.id} onSelect={() => setSelected(seat)} />
          ))}
        </div>
      )}

      {selected && <SeatDrilldown seat={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function DistrictGrid({
  stateCode,
  seats,
  selectedId,
  onSelect,
}: {
  stateCode: string;
  seats: StateSeatDetail[];
  selectedId: string | null;
  onSelect: (seat: StateSeatDetail) => void;
}) {
  const layout = (stateDistrictLayouts as Record<string, StateLayout>)[stateCode];

  // Should only happen if a state is missing from the precomputed layout
  // file — falls back to a plain grid rather than rendering nothing.
  if (!layout || layout.points.length < seats.length) {
    return <PlainGridFallback seats={seats} selectedId={selectedId} onSelect={onSelect} />;
  }

  // Points are precomputed in reading order (top-to-bottom); seats are
  // already sorted by district number (see getStateDelegation) — the pairing
  // is a schematic placement, not real per-district geography.
  const cellRadius = Math.max(1.8, Math.min(5, Math.sqrt((layout.viewBoxWidth * layout.viewBoxHeight) / seats.length) * 0.4));

  return (
    <svg viewBox={`0 0 ${layout.viewBoxWidth} ${layout.viewBoxHeight}`} className="w-full max-w-sm" style={{ maxHeight: "70vh" }}>
      <path d={layout.outline} fill="var(--color-paper-muted)" stroke="var(--color-rule)" strokeWidth={0.5} />
      {seats.map((seat, i) => {
        const p = layout.points[i];
        const isSelected = selectedId === seat.id;
        return (
          <rect
            key={seat.id}
            x={p.x - cellRadius}
            y={p.y - cellRadius}
            width={cellRadius * 2}
            height={cellRadius * 2}
            rx={cellRadius * 0.3}
            fill={seatColor(seat.party, seat.rating)}
            stroke={isSelected ? "var(--color-ink)" : "none"}
            strokeWidth={isSelected ? 0.8 : 0}
            onClick={() => onSelect(seat)}
            className="cursor-pointer"
          >
            <title>{seat.seatLabel}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/** Only used if a state is somehow absent from state-district-layouts.json. */
function PlainGridFallback({
  seats,
  selectedId,
  onSelect,
}: {
  seats: StateSeatDetail[];
  selectedId: string | null;
  onSelect: (seat: StateSeatDetail) => void;
}) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(seats.length)));
  const maxGridWidth = columns * 96;

  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, maxWidth: maxGridWidth }}>
      {seats.map((seat) => (
        <button
          key={seat.id}
          onClick={() => onSelect(seat)}
          title={seat.seatLabel}
          className="aspect-square rounded-md flex items-center justify-center text-[10px] font-bold transition-transform hover:scale-105"
          style={{
            background: seatColor(seat.party, seat.rating),
            outline: selectedId === seat.id ? "2px solid var(--color-ink)" : "none",
            outlineOffset: -2,
            color: "rgba(0,0,0,0.55)",
          }}
        >
          {seat.district ?? ""}
        </button>
      ))}
    </div>
  );
}

function SeatTile({ seat, isSelected, onSelect }: { seat: StateSeatDetail; isSelected: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className="rc-card p-3 text-left flex items-center gap-3"
      style={{ outline: isSelected ? "2px solid var(--color-ink)" : "none", outlineOffset: -2 }}
    >
      <span className="inline-block h-8 w-8 rounded-md shrink-0" style={{ background: seatColor(seat.party, seat.rating) }} />
      <div>
        <p className="text-sm font-semibold">{seat.seatLabel}</p>
        <p className="text-xs text-[var(--color-ink-soft)]">{seat.incumbent ? seat.incumbent.fullName : RATING_LABEL[seat.rating] ?? seat.rating}</p>
      </div>
    </button>
  );
}

function SeatDrilldown({ seat, onClose }: { seat: StateSeatDetail; onClose: () => void }) {
  return (
    <div className="rc-card p-4 text-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="section-label">{seat.seatLabel}</p>
          <p className="text-[var(--color-ink-soft)] mt-0.5">
            {seat.party === "D" ? "Democratic" : seat.party === "R" ? "Republican" : seat.party}
            {" · "}
            {RATING_LABEL[seat.rating] ?? seat.rating}
          </p>
        </div>
        <button onClick={onClose} className="text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]">
          Close ✕
        </button>
      </div>

      {seat.incumbent ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="headline-link text-base">{seat.incumbent.fullName}</p>

          {seat.incumbent.blocs.length > 0 && (
            <div>
              <p className="text-xs section-label mb-1">Caucus / bloc membership</p>
              <p className="text-[var(--color-ink-soft)]">{seat.incumbent.blocs.map((b) => b.name).join(", ")}</p>
            </div>
          )}

          {seat.incumbent.recentScoringEvents.length > 0 ? (
            <div>
              <p className="text-xs section-label mb-1">Recent scoring events</p>
              <ul className="flex flex-col gap-0.5">
                {seat.incumbent.recentScoringEvents.map((e, i) => (
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
        <p className="mt-3 text-[var(--color-ink-soft)]">No legislator record seeded/imported for this seat yet.</p>
      )}
    </div>
  );
}
