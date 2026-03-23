import React, { useState, useEffect, useMemo } from "react";
import { useWebSocket } from "../hooks/useWebSocket";
import { useHistory } from "../hooks/useHistory";
import { StatCard } from "../components/StatCard";
import { TempCard } from "../components/TempCard";
import { HistoryCharts } from "../components/HistoryCharts";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

interface DashboardProps {
  onLogout: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onLogout }) => {
  const { stats, connected, recentStats } = useWebSocket();
  const {
    data: historyData,
    loading: historyLoading,
    fetchHistory,
  } = useHistory();
  const [historyRange, setHistoryRange] = useState<"day" | "week">("day");
  useEffect(() => {
    fetchHistory(historyRange);
    const interval = setInterval(() => fetchHistory(historyRange), 60_000);
    return () => clearInterval(interval);
  }, [historyRange, fetchHistory]);

  const cpuRecent = useMemo(
    () => recentStats.map((s) => s.cpu.usage_percent),
    [recentStats],
  );
  const memRecent = useMemo(
    () => recentStats.map((s) => s.memory.usage_percent),
    [recentStats],
  );
  const diskRecent = useMemo(
    () => recentStats.map((s) => s.disk.usage_percent),
    [recentStats],
  );
  const netRxRecent = useMemo(
    () => recentStats.map((s) => s.network.rx_bytes_per_sec),
    [recentStats],
  );
  const diskReadRecent = useMemo(
    () => recentStats.map((s) => s.disk_io.read_bytes_per_sec),
    [recentStats],
  );

  if (!stats) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner" />
        <p>Connecting to server...</p>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <span className="header-logo">📊</span>
          <h1>Pi Dash</h1>
          <span
            className={`status-dot ${connected ? "connected" : "disconnected"}`}
          />
        </div>
        <button className="logout-btn" onClick={onLogout}>
          Logout
        </button>
      </header>

      <div className="stats-grid">
        <TempCard sensors={stats.temperatures} />
        <StatCard
          title="CPU"
          icon="⚡"
          color="#6366f1"
          value={`${stats.cpu.usage_percent.toFixed(1)}%`}
          percent={stats.cpu.usage_percent}
          subtitle={`${stats.cpu.frequency_mhz} MHz${stats.cpu.temperature != null ? ` · ${stats.cpu.temperature.toFixed(1)}°C` : ""}`}
          recentData={cpuRecent}
        />
        <StatCard
          title="Memory"
          icon="🧠"
          color="#10b981"
          value={`${stats.memory.usage_percent.toFixed(1)}%`}
          percent={stats.memory.usage_percent}
          subtitle={`${formatBytes(stats.memory.used_bytes)} / ${formatBytes(stats.memory.total_bytes)} · ${formatBytes(stats.memory.free_bytes)} free`}
          recentData={memRecent}
        />
        <StatCard
          title="Disk"
          icon="💾"
          color="#f59e0b"
          value={`${stats.disk.usage_percent.toFixed(1)}%`}
          percent={stats.disk.usage_percent}
          subtitle={`${formatBytes(stats.disk.used_bytes)} / ${formatBytes(stats.disk.total_bytes)} · ${formatBytes(stats.disk.available_bytes)} avail`}
          recentData={diskRecent}
        />
        <StatCard
          title="Network"
          icon="🌐"
          color="#3b82f6"
          value={`${formatBytes(stats.network.rx_bytes_per_sec)}/s ↓`}
          subtitle={`${formatBytes(stats.network.tx_bytes_per_sec)}/s ↑`}
          recentData={netRxRecent}
          maxLimit="auto"
        />
        <StatCard
          title="Disk I/O"
          icon="💽"
          color="#ec4899"
          value={`${formatBytes(stats.disk_io.read_bytes_per_sec)}/s R`}
          subtitle={`${formatBytes(stats.disk_io.write_bytes_per_sec)}/s W`}
          recentData={diskReadRecent}
          maxLimit="auto"
        />
      </div>

      <div className="history-section">
        <div className="history-header">
          <h2>History</h2>
          <div className="history-tabs">
            <button
              className={`history-tab ${historyRange === "day" ? "active" : ""}`}
              onClick={() => setHistoryRange("day")}
            >
              24 Hours
            </button>
            <button
              className={`history-tab ${historyRange === "week" ? "active" : ""}`}
              onClick={() => setHistoryRange("week")}
            >
              7 Days
            </button>
          </div>
        </div>
        {historyData && historyData.points.length > 0 && (
          <HistoryCharts
            data={historyData.points}
            range={historyRange}
            loading={historyLoading}
          />
        )}
        {historyData && historyData.points.length === 0 && (
          <div className="history-empty">
            No history data yet. Data will accumulate over time.
          </div>
        )}
      </div>
    </div>
  );
};
