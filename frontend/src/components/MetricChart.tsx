import React, { useRef, useEffect } from "react";
import * as echarts from "../lib/echarts";
import { HistoryPoint } from "../types";

interface MetricChartProps {
  data: HistoryPoint[];
  range: string;
  metricType: "cpu" | "memory" | "disk" | "temperature" | "network_rx" | "network_tx" | "disk_read" | "disk_write";
  loading: boolean;
  groupId?: string;
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
  network_rx: {
    title: "Network Rx",
    color: "#3b82f6",
    dataKey: (p: HistoryPoint) => p.network_rx_bytes_sec || 0,
    unit: "B/s",
    max: 0,
  },
  network_tx: {
    title: "Network Tx",
    color: "#8b5cf6",
    dataKey: (p: HistoryPoint) => p.network_tx_bytes_sec || 0,
    unit: "B/s",
    max: 0,
  },
  disk_read: {
    title: "Disk Read",
    color: "#ec4899",
    dataKey: (p: HistoryPoint) => p.disk_read_bytes_sec || 0,
    unit: "B/s",
    max: 0,
  },
  disk_write: {
    title: "Disk Write",
    color: "#14b8a6",
    dataKey: (p: HistoryPoint) => p.disk_write_bytes_sec || 0,
    unit: "B/s",
    max: 0,
  },
};

export const MetricChart: React.FC<MetricChartProps> = ({
  data,
  range,
  metricType,
  loading,
  groupId,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts>(null);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current, "dark");
      if (groupId) {
        chartInstance.current.group = groupId;
        echarts.connect(groupId);
      }
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
      } else if (config.unit === "B/s") {
        // Network/Disk: floor at 0, no hard ceiling
        yMin = 0;
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
            let formattedValue = value !== null ? value + config.unit : "N/A";
            if (value !== null && config.unit === "B/s") {
              if (value >= 1073741824) formattedValue = (value / 1073741824).toFixed(2) + ' GB/s';
              else if (value >= 1048576) formattedValue = (value / 1048576).toFixed(2) + ' MB/s';
              else if (value >= 1024) formattedValue = (value / 1024).toFixed(2) + ' KB/s';
              else formattedValue = value.toFixed(0) + ' B/s';
            }
            return `${params[0].axisValueLabel}<br/>${config.title}: <strong>${formattedValue}</strong>`;
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
            formatter: (value: number) => {
              if (config.unit === "B/s") {
                if (value >= 1073741824) return (value / 1073741824).toFixed(1) + ' GB/s';
                if (value >= 1048576) return (value / 1048576).toFixed(1) + ' MB/s';
                if (value >= 1024) return (value / 1024).toFixed(1) + ' KB/s';
                return value.toFixed(0) + ' B/s';
              }
              return `${value}${config.unit}`;
            },
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
