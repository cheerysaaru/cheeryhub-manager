import { useCallback, useEffect, useState } from "react";
import { api, asArray } from "../services/api";
import type { FocusSession } from "../types";
import { useSocket } from "./useSocket";

export function useFocus(userId: string | null) {
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { on } = useSocket(userId);

  const loadSessions = useCallback(() => {
    return api<FocusSession[]>("/focus/history")
      .then((data) => {
        setSessions(
          asArray<FocusSession>(data).filter(
            (session): session is FocusSession =>
              Boolean(
                session &&
                typeof session === "object" &&
                typeof session.id === "string" &&
                typeof session.status === "string" &&
                typeof session.startedAt === "string",
              ),
          ),
        );
      })
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load focus sessions.",
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const fetchSessions = useCallback(() => {
    setLoading(true);
    setError(null);
    return loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    loadSessions();
    const cleanup = on<FocusSession>("focus:created", (session) => {
      setSessions((prev) =>
        prev.some((s) => s.id === session.id) ? prev : [session, ...prev],
      );
    });
    const cleanup2 = on<FocusSession>("focus:completed", (session) => {
      setSessions((prev) =>
        prev.map((s) => (s.id === session.id ? session : s)),
      );
    });
    return () => {
      cleanup();
      cleanup2();
    };
  }, [loadSessions, on]);

  const start = useCallback(
    async (durationMinutes: number, taskId?: string) => {
      const session = await api<FocusSession>("/focus/start", {
        method: "POST",
        body: JSON.stringify({ durationMinutes, taskId }),
      });
      setSessions((prev) =>
        prev.some((s) => s.id === session.id) ? prev : [session, ...prev],
      );
      return session;
    },
    [],
  );

  const complete = useCallback(async (id: string) => {
    const session = await api<FocusSession>(`/focus/${id}/complete`, {
      method: "POST",
    });
    setSessions((prev) => prev.map((s) => (s.id === id ? session : s)));
    return session;
  }, []);

  return { sessions, loading, error, fetchSessions, start, complete };
}
