"use client";

import type { EChartsOption } from "echarts";
import { EChart } from "./echart";
import type { BlocScore } from "@/server/domain/charts/bloc-leaderboard";

export function BlocLeaderboardChart({ data }: { data: BlocScore[] }) {
  const sorted = [...data].sort((a, b) => a.score - b.score); // ascending for horizontal bar (largest on top)

  const option: EChartsOption = {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => Number(v).toFixed(2) },
    grid: { left: 160, right: 32, top: 10, bottom: 10 },
    xAxis: { type: "value", axisLabel: { fontSize: 10 } },
    yAxis: {
      type: "category",
      data: sorted.map((d) => d.blocName),
      axisLabel: { fontSize: 10, width: 150, overflow: "truncate" },
    },
    series: [
      {
        type: "bar",
        data: sorted.map((d) => ({
          value: Number(d.score.toFixed(2)),
          itemStyle: { color: d.score >= 0 ? "#16a34a" : "#dc2626", borderRadius: [0, 4, 4, 0] },
        })),
        label: { show: true, position: "right", fontSize: 10, formatter: (p) => Number(p.value).toFixed(1) },
      },
    ],
  };

  if (data.length === 0) {
    return <p className="text-sm text-[var(--color-ink-soft)]">No blocs to rank yet.</p>;
  }

  return <EChart option={option} height={Math.max(200, sorted.length * 28 + 40)} />;
}
