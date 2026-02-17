import React from "react";
import { MetricChart } from "./MetricChart";
import { HistoryPoint } from "../types";

interface HistoryChartsProps {
  data: HistoryPoint[];
  range: string;
}

export const HistoryCharts: React.FC<HistoryChartsProps> = ({
  data,
  range,
}) => {
  // Filter out temperature if no data is available
  const hasTemperatureData = data.some((p) => p.cpu_temp !== null);

  return (
    <div className="history-charts-grid">
      {hasTemperatureData && (
        <div className="metric-chart-wrapper">
          <MetricChart data={data} range={range} metricType="temperature" />
        </div>
      )}
      <div className="metric-chart-wrapper">
        <MetricChart data={data} range={range} metricType="cpu" />
      </div>
      <div className="metric-chart-wrapper">
        <MetricChart data={data} range={range} metricType="memory" />
      </div>
      <div className="metric-chart-wrapper">
        <MetricChart data={data} range={range} metricType="disk" />
      </div>
    </div>
  );
};
