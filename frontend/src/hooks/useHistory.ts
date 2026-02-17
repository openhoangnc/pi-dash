import { useState, useCallback } from "react";
import { HistoryResponse } from "../types";

export function useHistory(token: string | null) {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(
    async (range: "day" | "week") => {
      if (!token) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/history?range=${range}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const json: HistoryResponse = await res.json();
          setData(json);
        }
      } catch (e) {
        console.error("Failed to fetch history:", e);
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  return { data, loading, fetchHistory };
}
