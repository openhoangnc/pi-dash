import React, { useRef, useEffect } from "react";
import * as echarts from "echarts";
import { TemperatureSensor } from "../types";

interface TempChartProps {
  sensors: TemperatureSensor[];
  recentTemps?: Map<string, number[]>;
}

export const TempCard: React.FC<TempChartProps> = ({
  sensors,
  recentTemps,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts>(null);

  useEffect(() => {
    if (!chartRef.current || sensors.length === 0) return;
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, "dark");
    }
    const chart = chartInstance.current;

    const colors = [
      "#ef4444",
      "#f97316",
      "#eab308",
      "#22c55e",
      "#06b6d4",
      "#8b5cf6",
      "#ec4899",
      "#64748b",
    ];

    chart.setOption(
      {
        backgroundColor: "transparent",
        tooltip: {
          trigger: "axis",
          backgroundColor: "rgba(20, 20, 30, 0.95)",
          borderColor: "rgba(255,255,255,0.1)",
          textStyle: { color: "#e0e0e0", fontSize: 11 },
          formatter: (params: any) => {
            let s = "";
            for (const p of params) {
              s += `<span style="color:${p.color}">●</span> ${p.seriesName}: <b>${p.value}°C</b><br/>`;
            }
            return s;
          },
        },
        legend: {
          data: sensors.map((s) => s.label),
          textStyle: { color: "#aaa", fontSize: 10 },
          top: 0,
          type: "scroll",
          itemWidth: 10,
          itemHeight: 6,
        },
        grid: { top: 30, right: 8, bottom: 8, left: 40 },
        xAxis: {
          show: false,
          type: "category",
          data: Array.from({ length: 60 }, (_, i) => i),
        },
        yAxis: {
          type: "value",
          axisLabel: { color: "#888", fontSize: 10, formatter: "{value}°" },
          splitLine: { lineStyle: { color: "#222" } },
        },
        series: sensors.map((sensor, i) => ({
          name: sensor.label,
          type: "line",
          data: recentTemps?.get(sensor.label) || [sensor.temperature],
          smooth: true,
          symbol: "none",
          lineStyle: { width: 1.5, color: colors[i % colors.length] },
        })),
      },
      true,
    );
  }, [sensors, recentTemps]);

  useEffect(() => {
    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="stat-card temp-card">
      <div className="stat-card-header">
        <span className="stat-card-icon">🌡️</span>
        <span className="stat-card-title">Temperatures</span>
      </div>
      <div className="temp-list">
        {sensors.map((s, i) => (
          <div key={i} className="temp-item">
            <span className="temp-label">{s.label}</span>
            <span
              className="temp-value"
              style={{
                color:
                  s.temperature > 80
                    ? "#ef4444"
                    : s.temperature > 60
                      ? "#f59e0b"
                      : "#10b981",
              }}
            >
              {s.temperature.toFixed(1)}°C
            </span>
          </div>
        ))}
      </div>
      {sensors.length > 0 && <div className="temp-chart-area" ref={chartRef} />}
      {sensors.length === 0 && (
        <div className="temp-empty">No sensors detected</div>
      )}
    </div>
  );
};
