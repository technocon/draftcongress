"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { PieChart, BarChart, LineChart, ScatterChart } from "echarts/charts";
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";

echarts.use([
  PieChart,
  BarChart,
  LineChart,
  ScatterChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

/**
 * Generic ECharts wrapper — every chart component in this directory
 * builds an `EChartsOption` server-side (or in a small data-prep step)
 * and hands it to this the same way. Registers only the chart/component
 * types actually used across the app (see `echarts.use([...])` above)
 * rather than importing all of echarts, to keep the client bundle small.
 */
export function EChart({
  option,
  height = 320,
  className,
  onEvents,
}: {
  option: EChartsOption;
  height?: number;
  className?: string;
  /** Maps an ECharts event name (e.g. "click") to a handler — bound/rebound whenever the handler identity changes. */
  onEvents?: Record<string, (params: unknown) => void>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current);
    chartRef.current = chart;

    const resize = () => chart.resize();
    window.addEventListener("resize", resize);

    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onEvents) return;
    for (const [event, handler] of Object.entries(onEvents)) {
      chart.on(event, handler);
    }
    return () => {
      for (const event of Object.keys(onEvents)) {
        chart.off(event);
      }
    };
  }, [onEvents]);

  return <div ref={containerRef} className={className} style={{ width: "100%", height }} />;
}
