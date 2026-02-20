import { useState, useEffect, useRef, useCallback } from "react";
import { SystemStats } from "../types";
import { getAccessToken, refreshAccessToken } from "../api";

export function useWebSocket() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const [recentStats, setRecentStats] = useState<SystemStats[]>([]);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const connect = useCallback(() => {
    const token = getAccessToken();
    if (!token) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`,
    );

    ws.onopen = () => {
      if (isMounted.current) setConnected(true);
    };

    ws.onmessage = (event) => {
      if (!isMounted.current) return;
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

    ws.onclose = async () => {
      if (isMounted.current) setConnected(false);
      wsRef.current = null;

      if (!isMounted.current) return;

      // Try to refresh token before reconnecting
      await refreshAccessToken();

      if (isMounted.current) {
        // Reconnect after 2s
        reconnectTimer.current = setTimeout(connect, 2000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current != null) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { stats, connected, recentStats };
}
