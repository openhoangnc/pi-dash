import React, { useRef, useEffect, useMemo } from "react";
import * as echarts from "echarts";
import { TemperatureSensor } from "../types";

interface TempChartProps {
  sensors: TemperatureSensor[];
  recentTemps?: Map<string, number[]>;
}

interface GroupedSensor {
  label: string;
  temperature: number;
  sensors: TemperatureSensor[];
}

export const TempCard: React.FC<TempChartProps> = ({
  sensors,
  recentTemps,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts>(null);

  // Group sensors and compute max values
  const groupedSensors = useMemo(() => {
    const groups = new Map<string, TemperatureSensor[]>();

    sensors.forEach((sensor) => {
      const label = sensor.label.toLowerCase();

      // Check if it's SOC-related (npu, core, gpu soc, center)
      if (
        label.includes("npu") ||
        label.includes("core") ||
        label.includes("gpu") ||
        label.includes("soc") ||
        label.includes("center")
      ) {
        const existing = groups.get("SOC") || [];
        groups.set("SOC", [...existing, sensor]);
      } else {
        // Group by sensor type for others
        const existing = groups.get(sensor.sensor_type) || [];
        groups.set(sensor.sensor_type, [...existing, sensor]);
      }
    });

    // Convert to array with max temperature
    const result: GroupedSensor[] = [];
    groups.forEach((sensorList, groupName) => {
      const maxTemp = Math.max(...sensorList.map((s) => s.temperature));
      result.push({
        label: groupName,
        temperature: maxTemp,
        sensors: sensorList,
      });
    });

    return result;
  }, [sensors]);

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

    // Compute grouped history data
    const groupedHistoryData = groupedSensors.map((group) => {
      if (!recentTemps || recentTemps.size === 0) {
        return [group.temperature];
      }

      // Get max length of history across all sensors in this group
      const histories = group.sensors.map(
        (s) => recentTemps.get(s.label) || [],
      );
      const maxLength = Math.max(...histories.map((h) => h.length), 1);

      // For each time point, get the max temp across all sensors in the group
      const groupHistory: number[] = [];
      for (let i = 0; i < maxLength; i++) {
        const temps = histories.map((h) => h[i]).filter((t) => t !== undefined);
        groupHistory.push(
          temps.length > 0 ? Math.max(...temps) : group.temperature,
        );
      }

      return groupHistory;
    });

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
          data: groupedSensors.map((g) => g.label),
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
        series: groupedSensors.map((group, i) => ({
          name: group.label,
          type: "line",
          data: groupedHistoryData[i],
          smooth: true,
          symbol: "none",
          lineStyle: { width: 1.5, color: colors[i % colors.length] },
        })),
      },
      true,
    );
  }, [sensors, recentTemps, groupedSensors]);

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
        {groupedSensors.map((group, i) => (
          <div key={i} className="temp-item">
            <span className="temp-label">{group.label}</span>
            <span
              className="temp-value"
              style={{
                color:
                  group.temperature > 80
                    ? "#ef4444"
                    : group.temperature > 60
                      ? "#f59e0b"
                      : "#10b981",
              }}
            >
              {group.temperature.toFixed(1)}°C
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
