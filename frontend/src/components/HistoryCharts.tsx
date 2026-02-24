import React, { useMemo } from "react";
import { MetricChart } from "./MetricChart";
import { HistoryPoint } from "../types";

const aggregateData = (data: HistoryPoint[]): HistoryPoint[] => {
  if (data.length <= 150) return data;

  const possibleSizes = [2, 5, 10, 15, 30, 60];
  let chunkSize = Math.ceil(data.length / 150);
  for (const size of possibleSizes) {
    if (data.length / size <= 150) {
      chunkSize = size;
      break;
    }
  }

  const result: HistoryPoint[] = [];
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    const count = chunk.length;

    let sumCpuPercent = 0;
    let sumCpuFreq = 0;
    let sumCpuTemp = 0;
    let cpuTempCount = 0;
    let sumMemPercent = 0;
    let sumDiskPercent = 0;
    const tempMap = new Map<string, { sum: number; count: number }>();

    for (const point of chunk) {
      sumCpuPercent += point.cpu_percent;
      sumCpuFreq += point.cpu_freq;
      if (point.cpu_temp !== null) {
        sumCpuTemp += point.cpu_temp;
        cpuTempCount++;
      }
      sumMemPercent += point.mem_percent;
      sumDiskPercent += point.disk_percent;

      for (const t of point.temperatures) {
        const existing = tempMap.get(t.label) ?? { sum: 0, count: 0 };
        existing.sum += t.temperature;
        existing.count++;
        tempMap.set(t.label, existing);
      }
    }

    const aggregatedTemps = Array.from(tempMap.entries()).map(
      ([label, stats]) => ({
        label,
        temperature: stats.sum / stats.count,
      }),
    );

    result.push({
      timestamp: chunk[0].timestamp, // Use the start of the chunk timestamp
      cpu_percent: sumCpuPercent / count,
      cpu_freq: sumCpuFreq / count,
      cpu_temp: cpuTempCount > 0 ? sumCpuTemp / cpuTempCount : null,
      mem_percent: sumMemPercent / count,
      disk_percent: sumDiskPercent / count,
      temperatures: aggregatedTemps,
    });
  }

  return result;
};

interface HistoryChartsProps {
  data: HistoryPoint[];
  range: string;
}

export const HistoryCharts: React.FC<HistoryChartsProps> = ({
  data,
  range,
}) => {
  const aggregatedData = useMemo(() => aggregateData(data), [data]);

  // Filter out temperature if no data is available
  const hasTemperatureData = aggregatedData.some((p) => p.cpu_temp !== null);

  return (
    <div className="history-charts-grid">
      {hasTemperatureData && (
        <div className="metric-chart-wrapper">
          <MetricChart
            data={aggregatedData}
            range={range}
            metricType="temperature"
          />
        </div>
      )}
      <div className="metric-chart-wrapper">
        <MetricChart data={aggregatedData} range={range} metricType="cpu" />
      </div>
      <div className="metric-chart-wrapper">
        <MetricChart data={aggregatedData} range={range} metricType="memory" />
      </div>
      <div className="metric-chart-wrapper">
        <MetricChart data={aggregatedData} range={range} metricType="disk" />
      </div>
    </div>
  );
};
