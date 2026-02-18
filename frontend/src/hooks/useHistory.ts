import { useState, useCallback } from "react";
import { HistoryResponse } from "../types";
import { apiFetch } from "../api";

export function useHistory() {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchHistory = useCallback(async (range: "day" | "week") => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/history?range=${range}`);
      if (res.ok) {
        const json: HistoryResponse = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error("Failed to fetch history:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, fetchHistory };
}
