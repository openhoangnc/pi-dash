import React, { useMemo } from "react";
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

export const TempCard: React.FC<TempChartProps> = ({ sensors }) => {
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

  const getTempColor = (temp: number) => {
    if (temp > 80) return "#ef4444";
    if (temp > 60) return "#f59e0b";
    return "#10b981";
  };

  return (
    <div className="stat-card temp-card">
      <div className="stat-card-header">
        <span className="stat-card-icon">🌡️</span>
        <span className="stat-card-title">Temperatures</span>
      </div>
      {sensors.length === 0 ? (
        <div className="temp-empty">No sensors detected</div>
      ) : (
        <div className="temp-big-grid">
          {groupedSensors.map((group, i) => (
            <div key={i} className="temp-big-item">
              <span
                className="temp-big-value"
                style={{ color: getTempColor(group.temperature) }}
              >
                {group.temperature.toFixed(1)}°
              </span>
              <span className="temp-big-label">{group.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
