import { useCallback, useEffect, useRef, useState } from "react";
import { api, asArray } from "../services/api";
import { dedupe } from "../services/inflight";
import { useSocket } from "./useSocket";
import type { DailyStats } from "../types";

export interface StreakInfo {
  current: number;
  best: number;
  todayActive: boolean;
}

export function useAnalytics(userId: string | null) {
  const [stats, setStats] = useState<DailyStats[]>([]);
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { on } = useSocket(userId);
  const mountedRef = useRef(true);
  const streakRequestRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchStats = useCallback(() => {
    return dedupe("analytics:stats", () => api<unknown>("/analytics")).then(
      (payload: unknown) => {
        const next = Array.isArray(payload)
          ? payload
          : payload && typeof payload === "object" && "stats" in payload
            ? asArray<DailyStats>(payload.stats)
            : [];
        if (mountedRef.current) {
          setStats(
            asArray<DailyStats>(next).filter((item): item is DailyStats =>
              Boolean(
                item &&
                typeof item === "object" &&
                typeof item.id === "string" &&
                typeof item.date === "string" &&
                typeof item.productivityPercentage === "number",
              ),
            ),
          );
        }
      },
    );
  }, []);

  const fetchStreaks = useCallback((forceRefresh = false) => {
    const requestId = ++streakRequestRef.current;
    const load = () => api<unknown>("/streaks");
    const dataPromise = forceRefresh
      ? load()
      : dedupe("analytics:streaks", load);
    return dataPromise.then((data: unknown) => {
      if (
        mountedRef.current &&
        requestId === streakRequestRef.current &&
        data &&
        typeof data === "object"
      ) {
        const payload = data as Partial<StreakInfo>;
        setStreak({
          current: typeof payload.current === "number" ? payload.current : 0,
          best: typeof payload.best === "number" ? payload.best : 0,
          todayActive: payload.todayActive === true,
        });
      }
    });
  }, []);

  const reportError = useCallback((caught: unknown) => {
    if (!mountedRef.current) return;
    setError(
      caught instanceof Error
        ? caught.message
        : "Unable to load analytics right now. Please try again.",
    );
  }, []);

  const loadAnalytics = useCallback(() => {
    return Promise.all([fetchStats(), fetchStreaks()])
      .catch(reportError)
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
  }, [fetchStats, fetchStreaks, reportError]);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    await loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  // Targeted refreshes: one event updates only what it can affect instead of
  // re-fetching all three endpoints (the old pattern fired 3 GETs per event).
  useEffect(() => {
    const cleanups = [
      on("habit:updated", () => {
        void fetchStreaks().catch(reportError);
      }),
      on("task:created", () => {
        void fetchStreaks(true).catch(reportError);
      }),
      on("task:updated", () => {
        void fetchStreaks().catch(reportError);
      }),
    ];
    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [fetchStreaks, on, reportError]);

  const exportBackup = useCallback(async () => {
    const data = await api<Blob>("/backup/export");
    return data;
  }, []);

  const importBackup = useCallback(async (data: unknown) => {
    const result = await api("/backup/import", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return result;
  }, []);

  return {
    stats,
    streak,
    loading,
    error,
    fetchAnalytics,
    exportBackup,
    importBackup,
  };
}
