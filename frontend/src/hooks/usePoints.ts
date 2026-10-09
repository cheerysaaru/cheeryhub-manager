import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../services/api";
import { dedupe } from "../services/inflight";
import type { PointEvent, PointsSummary } from "../types";

function normalizeSummary(payload: unknown): PointsSummary | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Partial<PointsSummary>;
  const number = (value: unknown, fallback = 0) =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  const events = Array.isArray(data.events)
    ? (data.events.filter((event): event is PointEvent =>
        Boolean(
          event &&
          typeof event === "object" &&
          typeof event.id === "string" &&
          typeof event.amount === "number" &&
          typeof event.reason === "string",
        ),
      ) as PointEvent[])
    : [];
  return {
    totalEarned: number(data.totalEarned),
    totalLost: number(data.totalLost),
    net: number(data.net),
    currentTotal: number(data.currentTotal),
    level: Math.max(1, number(data.level, 1)),
    pointsIntoLevel: number(data.pointsIntoLevel),
    pointsNeededForNextLevel: Math.max(
      100,
      number(data.pointsNeededForNextLevel, 100),
    ),
    events,
  };
}

/**
 * The points summary from GET /points (which also recalculates editable days
 * server-side). `refresh` re-fetches after any completion/check-in write.
 */
export function usePoints(userId: string | null) {
  const [points, setPoints] = useState<PointsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    if (!userId) {
      if (mountedRef.current) {
        setPoints(null);
        setLoading(false);
      }
      return Promise.resolve(null);
    }
    return dedupe("points:summary", () => api<PointsSummary>("/points"))
      .then(
        (data) => {
          const summary = normalizeSummary(data);
          if (mountedRef.current) {
            setPoints(summary);
            setError(null);
          }
          return summary;
        },
        (caught: unknown) => {
          if (mountedRef.current) {
            setError(
              caught instanceof Error
                ? caught.message
                : "Unable to load points right now. Please try again.",
            );
          }
          return null;
        },
      )
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { points, loading, error, refresh };
}
