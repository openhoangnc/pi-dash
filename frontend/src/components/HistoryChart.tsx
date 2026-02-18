import React, { useRef, useEffect } from "react";
import * as echarts from "../lib/echarts";
import { HistoryPoint } from "../types";

interface HistoryChartProps {
  data: HistoryPoint[];
  range: string;
}

export const HistoryChart: React.FC<HistoryChartProps> = ({ data, range }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts>(null);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, "dark");
    }
    const chart = chartInstance.current;

    const timestamps = data.map((p) => {
      const d = new Date(p.timestamp);
      return range === "week"
        ? d.toLocaleDateString(undefined, {
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
          })
        : d.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          });
    });

    chart.setOption(
      {
        backgroundColor: "transparent",
        tooltip: {
          trigger: "axis",
          backgroundColor: "rgba(20, 20, 30, 0.95)",
          borderColor: "rgba(255,255,255,0.1)",
          textStyle: { color: "#e0e0e0", fontSize: 11 },
        },
        legend: {
          data: ["CPU %", "Memory %", "Disk %", "CPU Temp"],
          textStyle: { color: "#aaa", fontSize: 11 },
          top: 0,
          itemWidth: 12,
          itemHeight: 8,
        },
        grid: { top: 35, right: 12, bottom: 30, left: 45 },
        xAxis: {
          type: "category",
          data: timestamps,
          axisLabel: {
            color: "#888",
            fontSize: 10,
            rotate: range === "week" ? 30 : 0,
          },
          axisLine: { lineStyle: { color: "#333" } },
        },
        yAxis: {
          type: "value",
          min: 0,
          max: 100,
          axisLabel: { color: "#888", fontSize: 10, formatter: "{value}%" },
          splitLine: { lineStyle: { color: "#222" } },
        },
        series: [
          {
            name: "CPU %",
            type: "line",
            data: data.map((p) => Math.round(p.cpu_percent * 10) / 10),
            smooth: true,
            symbol: "none",
            lineStyle: { width: 2, color: "#6366f1" },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: "rgba(99,102,241,0.25)" },
                { offset: 1, color: "rgba(99,102,241,0.02)" },
              ]),
            },
          },
          {
            name: "Memory %",
            type: "line",
            data: data.map((p) => Math.round(p.mem_percent * 10) / 10),
            smooth: true,
            symbol: "none",
            lineStyle: { width: 2, color: "#10b981" },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: "rgba(16,185,129,0.2)" },
                { offset: 1, color: "rgba(16,185,129,0.02)" },
              ]),
            },
          },
          {
            name: "Disk %",
            type: "line",
            data: data.map((p) => Math.round(p.disk_percent * 10) / 10),
            smooth: true,
            symbol: "none",
            lineStyle: { width: 2, color: "#f59e0b" },
          },
          {
            name: "CPU Temp",
            type: "line",
            data: data.map((p) =>
              p.cpu_temp != null ? Math.round(p.cpu_temp * 10) / 10 : null,
            ),
            smooth: true,
            symbol: "none",
            lineStyle: { width: 2, color: "#ef4444", type: "dashed" },
          },
        ],
      },
      true,
    );

    return () => {};
  }, [data, range]);

  useEffect(() => {
    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return <div ref={chartRef} className="history-chart" />;
};
