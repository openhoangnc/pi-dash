import React, { useRef, useEffect } from "react";
import * as echarts from "../lib/echarts";
import { HistoryPoint } from "../types";

interface MetricChartProps {
  data: HistoryPoint[];
  range: string;
  metricType: "cpu" | "memory" | "disk" | "temperature";
  loading: boolean;
}

const metricConfig = {
  cpu: {
    title: "CPU Usage",
    color: "#6366f1",
    dataKey: (p: HistoryPoint) => Math.round(p.cpu_percent * 10) / 10,
    unit: "%",
    max: 100,
  },
  memory: {
    title: "Memory Usage",
    color: "#10b981",
    dataKey: (p: HistoryPoint) => Math.round(p.mem_percent * 10) / 10,
    unit: "%",
    max: 100,
  },
  disk: {
    title: "Disk Usage",
    color: "#f59e0b",
    dataKey: (p: HistoryPoint) => Math.round(p.disk_percent * 10) / 10,
    unit: "%",
    max: 100,
  },
  temperature: {
    title: "Temperature",
    color: "#ef4444",
    dataKey: (p: HistoryPoint) =>
      p.cpu_temp != null ? Math.round(p.cpu_temp * 10) / 10 : null,
    unit: "°C",
    max: 100,
  },
};

export const MetricChart: React.FC<MetricChartProps> = ({
  data,
  range,
  metricType,
  loading,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts>(null);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, "dark");
    }

    const chart = chartInstance.current;
    const config = metricConfig[metricType];

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

    const chartData = data.map(config.dataKey);

    // Compute dynamic y-axis bounds from actual data range
    const validValues = chartData.filter((v): v is number => v !== null);
    let yMin = 0;
    let yMax = config.max;

    if (validValues.length > 0) {
      const dataMin = Math.min(...validValues);
      const dataMax = Math.max(...validValues);
      const span = dataMax - dataMin;
      // 10% padding on each side, at least 2 units of breathing room
      const padding = Math.max(span * 0.1, 2);

      if (metricType === "temperature") {
        // Temperature: floor at 0°C, no hard ceiling
        yMin = Math.max(0, Math.floor(dataMin - padding));
        yMax = Math.ceil(dataMax + padding);
      } else {
        // Percentage metrics: clamp to [0, 100]
        yMin = Math.max(0, Math.floor(dataMin - padding));
        yMax = Math.min(100, Math.ceil(dataMax + padding));
      }
    }

    chart.setOption(
      {
        backgroundColor: "transparent",
        tooltip: {
          trigger: "axis",
          backgroundColor: "rgba(20, 20, 30, 0.95)",
          borderColor: "rgba(255,255,255,0.1)",
          textStyle: { color: "#e0e0e0", fontSize: 11 },
          formatter: (params: any) => {
            const value = params[0].value;
            return `${params[0].axisValueLabel}<br/>${config.title}: <strong>${value !== null ? value + config.unit : "N/A"}</strong>`;
          },
        },
        grid: {
          top: 40,
          right: 16,
          bottom: 40,
          left: 50,
        },
        xAxis: {
          type: "category",
          data: timestamps,
          axisLabel: {
            color: "#888",
            fontSize: 10,
            rotate: 30,
          },
          axisLine: { lineStyle: { color: "#333" } },
        },
        yAxis: {
          type: "value",
          min: yMin,
          max: yMax,
          axisLabel: {
            color: "#888",
            fontSize: 10,
            formatter: `{value}${config.unit}`,
          },
          splitLine: { lineStyle: { color: "#222" } },
        },
        series: [
          {
            name: config.title,
            type: "line",
            data: chartData,
            smooth: true,
            symbol: "none",
            lineStyle: {
              width: 2,
              color: config.color,
            },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: `${config.color}40` },
                { offset: 1, color: `${config.color}05` },
              ]),
            },
          },
        ],
        title: {
          text: config.title,
          left: 16,
          top: 8,
          textStyle: {
            color: "#94a3b8",
            fontSize: 13,
            fontWeight: 600,
          },
        },
      },
      true,
    );

    return () => {};
  }, [data, range, metricType]);

  useEffect(() => {
    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div style={{ position: "relative" }}>
      <div ref={chartRef} className="metric-chart" />
      {loading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0, 0, 0, 0.04)",
            backdropFilter: "blur(2px)",
            borderRadius: "inherit",
            zIndex: 10,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              border: "3px solid rgba(255,255,255,0.15)",
              borderTopColor: "#6366f1",
              borderRadius: "50%",
              animation: "metric-chart-spin 0.25s linear infinite",
            }}
          />
          <style>{`
            @keyframes metric-chart-spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
};
