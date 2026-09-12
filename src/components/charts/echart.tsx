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
  aspectRatio,
  className,
  onEvents,
}: {
  option: EChartsOption;
  height?: number;
  /**
   * width/height ratio to lock the container to via CSS `aspect-ratio`,
   * instead of a fixed pixel `height` with a fluid width. Use this for
   * any chart whose x/y units must stay visually equal-scaled (e.g. a
   * hemicycle/scatter layout) — ECharts' cartesian grid has no built-in
   * "preserve aspect ratio" option, so without a locked container ratio
   * the plotted shape stretches into an ellipse whenever the container's
   * own width/height ratio drifts from whatever it was computed for.
   */
  aspectRatio?: number;
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

    // A ResizeObserver on the container itself — not a `window` resize
    // listener — is what actually catches every reason a chart's box can
    // change size: window resize, yes, but also flex/grid reflow, a
    // sidebar opening, or a webfont finishing its load after ECharts
    // already measured the container at init time. Without this, a chart
    // can initialize against a stale/wrong pixel size and then get
    // visibly stretched by its own CSS `width:100%` once the real layout
    // settles, with nothing ever telling ECharts to re-measure.
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
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

  return (
    <div
      ref={containerRef}
      className={className}
      style={aspectRatio ? { width: "100%", aspectRatio: String(aspectRatio) } : { width: "100%", height }}
    />
  );
}
