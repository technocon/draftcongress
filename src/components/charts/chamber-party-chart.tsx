"use client";

import type { EChartsOption } from "echarts";
import { EChart } from "./echart";
import type { PartySlice } from "@/server/domain/charts/chamber-composition";

const PARTY_COLORS: Record<string, string> = {
  D: "#2563eb",
  R: "#dc2626",
  I: "#7c3aed",
};

export function ChamberPartyChart({ title, data }: { title: string; data: PartySlice[] }) {
  const option: EChartsOption = {
    title: { text: title, left: "center", textStyle: { fontSize: 13, fontWeight: 500 } },
    tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
    legend: { bottom: 0, textStyle: { fontSize: 11 } },
    series: [
      {
        type: "pie",
        radius: ["45%", "70%"],
        center: ["50%", "48%"],
        avoidLabelOverlap: true,
        label: { formatter: "{b}\n{c}", fontSize: 11 },
        data: data.map((d) => ({
          name: d.party,
          value: d.count,
          itemStyle: { color: PARTY_COLORS[d.party] ?? "#9ca3af" },
        })),
      },
    ],
  };

  return <EChart option={option} height={260} />;
}
