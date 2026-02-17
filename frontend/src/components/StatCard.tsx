import React, { useRef, useEffect } from "react";
import * as echarts from "echarts";
import { SystemStats } from "../types";

interface StatCardProps {
  title: string;
  value: string;
  percent: number;
  subtitle?: string;
  icon: string;
  color: string;
  recentData?: number[];
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  percent,
  subtitle,
  icon,
  color,
  recentData,
}) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts>(null);

  useEffect(() => {
    if (!chartRef.current) return;
    if (!chartInstance.current) {
      chartInstance.current = echarts.init(chartRef.current);
    }
    const chart = chartInstance.current;

    chart.setOption(
      {
        grid: { top: 2, right: 0, bottom: 2, left: 0 },
        xAxis: {
          show: false,
          type: "category",
          data: recentData?.map((_, i) => i) || [],
        },
        yAxis: { show: false, type: "value", min: 0, max: 100 },
        series: [
          {
            type: "line",
            data: recentData || [],
            smooth: true,
            symbol: "none",
            lineStyle: { width: 1.5, color },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: color + "40" },
                { offset: 1, color: color + "05" },
              ]),
            },
          },
        ],
      },
      true,
    );

    return () => {};
  }, [recentData, color]);

  useEffect(() => {
    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const clampedPercent = Math.min(100, Math.max(0, percent));

  return (
    <div className="stat-card">
      <div className="stat-card-header">
        <span className="stat-card-icon">{icon}</span>
        <span className="stat-card-title">{title}</span>
      </div>
      <div className="stat-card-value">{value}</div>
      {subtitle && <div className="stat-card-subtitle">{subtitle}</div>}
      <div className="stat-card-bar">
        <div
          className="stat-card-bar-fill"
          style={{ width: `${clampedPercent}%`, backgroundColor: color }}
        />
      </div>
      <div className="stat-card-sparkline" ref={chartRef} />
    </div>
  );
};
