"use client";

import type { EChartsOption } from "echarts";
import { EChart } from "./echart";
import type { RaceSeries } from "@/server/domain/charts/standings-race";

const SERIES_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0ea5e9", "#db2777", "#65a30d"];

export function StandingsRaceChart({ series }: { series: RaceSeries[] }) {
  const hasAnyPoints = series.some((s) => s.points.length > 0);

  const option: EChartsOption = {
    tooltip: { trigger: "axis" },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    grid: { left: 48, right: 24, top: 24, bottom: 48 },
    xAxis: { type: "time", axisLabel: { fontSize: 10 } },
    yAxis: { type: "value", name: "Cumulative score", nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
    series: series.map((s, i) => ({
      type: "line",
      name: s.ownerLabel,
      step: "end",
      showSymbol: s.points.length < 15,
      data: s.points.map((p) => [p.t, p.cumulativeScore]),
      itemStyle: { color: SERIES_COLORS[i % SERIES_COLORS.length] },
      lineStyle: { width: 2 },
    })),
  };

  if (!hasAnyPoints) {
    return <p className="text-sm text-neutral-500">No scoring events yet — the race will fill in as data is ingested.</p>;
  }

  return <EChart option={option} height={320} />;
}
