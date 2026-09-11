"use client";

import type { EChartsOption } from "echarts";
import { EChart } from "./echart";
import type { BlocSlice } from "@/server/domain/charts/chamber-composition";

export function ChamberBlocChart({ title, data }: { title: string; data: BlocSlice[] }) {
  const sorted = [...data].sort((a, b) => a.count - b.count); // ascending, so the horizontal bar chart reads largest-on-top

  const option: EChartsOption = {
    title: { text: title, left: "center", textStyle: { fontSize: 13, fontWeight: 500 } },
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 140, right: 24, top: 40, bottom: 10 },
    xAxis: { type: "value", axisLabel: { fontSize: 10 } },
    yAxis: {
      type: "category",
      data: sorted.map((d) => d.blocName),
      axisLabel: { fontSize: 10, width: 130, overflow: "truncate" },
    },
    series: [
      {
        type: "bar",
        data: sorted.map((d) => d.count),
        itemStyle: { color: "#9e1b1b", borderRadius: [0, 4, 4, 0] },
        label: { show: true, position: "right", fontSize: 10 },
      },
    ],
  };

  return <EChart option={option} height={Math.max(200, sorted.length * 32 + 60)} />;
}
