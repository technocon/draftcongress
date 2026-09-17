"use client";

import { useRef, useState } from "react";
import type { StateDelegation, StateSeatDetail } from "@/server/domain/charts/state-race-map";
import { RATING_LABEL, seatColor } from "./party-colors";

export interface StateBoundaryData {
  viewBoxWidth: number;
  viewBoxHeight: number;
  districts: { district: number; path: string }[];
}

const formatMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(n);

/**
 * A state's congressional delegation, tabbed House/Senate. House renders
 * real district boundaries (`boundaries`, precomputed server-side by
 * scripts/generate-district-boundaries.ts from Census cartographic
 * boundary data — see src/app/congress/states/[code]/page.tsx, which reads
 * just this one state's file and passes it down) — each district is its
 * own real polygon, colored by incumbent party and shaded by
 * competitiveness. Senate renders as two seat cards since senators are
 * elected statewide, with no districts to subdivide.
 */
export function StateDelegationView({
  delegation,
  boundaries,
}: {
  delegation: StateDelegation;
  boundaries: StateBoundaryData | null;
}) {
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
        <DistrictGrid boundaries={boundaries} seats={seats} selectedId={selected?.id ?? null} onSelect={setSelected} />
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
  boundaries,
  seats,
  selectedId,
  onSelect,
}: {
  boundaries: StateBoundaryData | null;
  seats: StateSeatDetail[];
  selectedId: string | null;
  onSelect: (seat: StateSeatDetail) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ seat: StateSeatDetail; x: number; y: number } | null>(null);

  const pathByDistrict = new Map((boundaries?.districts ?? []).map((d) => [d.district, d.path]));
  const missingAny = seats.some((s) => s.district == null || !pathByDistrict.has(s.district));

  // Should only happen if a state is missing from src/lib/district-boundaries
  // or a district number doesn't line up — falls back to a plain grid
  // rather than rendering a broken/partial map.
  if (!boundaries || missingAny) {
    return <PlainGridFallback seats={seats} selectedId={selectedId} onSelect={onSelect} />;
  }

  function handleHover(e: React.MouseEvent, seat: StateSeatDetail) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ seat, x: e.clientX - rect.left, y: e.clientY - rect.top });
  }

  return (
    <div ref={containerRef} className="relative">
      <svg
        viewBox={`0 0 ${boundaries.viewBoxWidth} ${boundaries.viewBoxHeight}`}
        style={{ width: "auto", height: "auto", maxWidth: "100%", maxHeight: "75vh" }}
      >
        {seats.map((seat) => {
          const d = pathByDistrict.get(seat.district!)!;
          const isSelected = selectedId === seat.id;
          return (
            <path
              key={seat.id}
              d={d}
              fill={seatColor(seat.party, seat.rating)}
              stroke={isSelected ? "var(--color-ink)" : "var(--color-paper)"}
              strokeWidth={isSelected ? 0.6 : 0.15}
              onMouseEnter={(e) => handleHover(e, seat)}
              onMouseMove={(e) => handleHover(e, seat)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect(seat)}
              className="cursor-pointer"
            />
          );
        })}
      </svg>
      {hover && <SeatTooltip seat={hover.seat} x={hover.x} y={hover.y} />}
    </div>
  );
}

/** Hover popup for a district — quick-glance info (name/party/last
 * election result); click still opens the fuller SeatDrilldown card
 * below the map for blocs/scoring events. Positioned centered above the
 * cursor so it doesn't need viewport-edge detection at typical map sizes. */
function SeatTooltip({ seat, x, y }: { seat: StateSeatDetail; x: number; y: number }) {
  return (
    <div
      className="pointer-events-none absolute z-10 rc-card px-3 py-2 text-xs shadow-lg"
      style={{ left: x, top: y, transform: "translate(-50%, calc(-100% - 10px))", minWidth: 160 }}
    >
      <p className="text-sm font-semibold">{seat.seatLabel}</p>
      <p className="text-[var(--color-ink-soft)]">
        {seat.party === "D" ? "Democratic" : seat.party === "R" ? "Republican" : seat.party}
      </p>
      <p className="mt-1 font-medium">{seat.incumbent ? seat.incumbent.fullName : "No legislator record yet"}</p>
      {seat.lastElectionPct != null && (
        <p className="text-[var(--color-ink-soft)]">
          Won {seat.lastElectionPct}% in {seat.lastElectionYear}
        </p>
      )}
      {seat.financeReceipts != null && (
        <p className="text-[var(--color-ink-soft)]">
          {formatMoney(seat.financeReceipts)} raised
          {seat.financeCashOnHand != null && ` · ${formatMoney(seat.financeCashOnHand)} on hand`}
        </p>
      )}
    </div>
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
            {seat.lastElectionPct != null && (
              <>
                {" · "}Won {seat.lastElectionPct}% ({seat.lastElectionYear})
              </>
            )}
          </p>
        </div>
        <button onClick={onClose} className="text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]">
          Close ✕
        </button>
      </div>

      {seat.incumbent ? (
        <div className="mt-3 flex flex-col gap-2">
          <p className="headline-link text-base">{seat.incumbent.fullName}</p>

          {seat.financeReceipts != null && (
            <div>
              {/* FEC's candidate name is often a fuller legal name than congress.gov's
                  (e.g. "John Kevin Sr. Ellzey" for "Jake Ellzey") — a plain string
                  compare against seat.incumbent.fullName would false-flag most of
                  these as a different person, so this only names whose FEC record
                  the numbers came from, without asserting whether it matches. */}
              <p className="text-xs section-label mb-1">Campaign finance — FEC record: {seat.financeCandidate}</p>
              <p className="text-[var(--color-ink-soft)]">
                {formatMoney(seat.financeReceipts ?? 0)} raised · {formatMoney(seat.financeDisbursements ?? 0)} spent ·{" "}
                {formatMoney(seat.financeCashOnHand ?? 0)} cash on hand
              </p>
            </div>
          )}

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
        <div className="mt-3 flex flex-col gap-2">
          <p className="text-[var(--color-ink-soft)]">No legislator record seeded/imported for this seat yet.</p>
          {seat.financeReceipts != null && (
            <div>
              <p className="text-xs section-label mb-1">Campaign finance ({seat.financeCandidate})</p>
              <p className="text-[var(--color-ink-soft)]">
                {formatMoney(seat.financeReceipts ?? 0)} raised · {formatMoney(seat.financeDisbursements ?? 0)} spent ·{" "}
                {formatMoney(seat.financeCashOnHand ?? 0)} cash on hand
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
