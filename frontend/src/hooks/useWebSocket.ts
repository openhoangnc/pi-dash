import { useState, useEffect, useRef, useCallback } from "react";
import { SystemStats } from "../types";

export function useWebSocket(token: string | null) {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const [recentStats, setRecentStats] = useState<SystemStats[]>([]);

  const connect = useCallback(() => {
    if (!token) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`,
    );

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data: SystemStats = JSON.parse(event.data);
        setStats(data);
        setRecentStats((prev) => {
          const next = [...prev, data];
          // Keep last 60 samples (1 minute of live data)
          return next.length > 60 ? next.slice(-60) : next;
        });
      } catch (e) {
        console.error("Failed to parse WS message:", e);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      // Reconnect after 2s
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [token]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current != null) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { stats, connected, recentStats };
}
