import React from "react";
import { TempGroup } from "../types";

interface TempCardProps {
  sensors: TempGroup[];
}

const getTempColor = (temp: number) => {
  if (temp > 80) return "#ef4444";
  if (temp > 60) return "#f59e0b";
  return "#10b981";
};

export const TempCard: React.FC<TempCardProps> = ({ sensors }) => {
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
          {sensors.map((group, i) => (
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
