import { useCallback, useEffect, useState } from "react";
import { api, asArray } from "../services/api";
import { dedupe } from "../services/inflight";

export interface SportExercise {
  id?: string;
  name: string;
  sets: number;
  reps: string;
}

export interface SportPhoto {
  id: string;
  image: string;
  label?: string | null;
  createdAt: string;
}

export interface SportSession {
  id: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  completedExercises?: string | null;
}

export interface SportAnalysis {
  totalWorkouts: number;
  totalSeconds: number;
  totalMinutes: number;
  averageSeconds: number;
  averageMinutes: number;
  consistency: number;
  plannedSessions: number;
  finishedInDays: number;
  firstPhoto: SportPhoto | null;
  latestPhoto: SportPhoto | null;
}

export interface Sport {
  id: string;
  name: string;
  daysPerWeek: number;
  restSeconds: number;
  durationMonths: number | null;
  untilStopped: boolean | number;
  dailyCommitments: boolean | number;
  commitmentDays: number[];
  habitId: string | null;
  active: boolean | number;
  startedAt: string;
  stoppedAt: string | null;
  exercises: SportExercise[];
  photos: SportPhoto[];
  sessions: SportSession[];
  analysis: SportAnalysis;
  photoDue: boolean;
}

export function useSports(userId: string | null) {
  const [sports, setSports] = useState<Sport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    return dedupe("sports:list", () => api<Sport[]>("/sports"))
      .then((data) => {
        setSports(asArray<Sport>(data));
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Could not load sports.");
      })
      .finally(() => setLoading(false));
  }, []);

  const fetchSports = useCallback(() => {
    setLoading(true);
    setError(null);
    return load();
  }, [load]);

  useEffect(() => {
    if (!userId) return;
    void load();
  }, [load, userId]);

  const createSport = useCallback(async (payload: Record<string, unknown>) => {
    const result = await api<Sport>("/sports", { method: "POST", body: JSON.stringify(payload) });
    await load();
    return result;
  }, [load]);

  const addPhoto = useCallback(async (sportId: string, image: string, label?: string) => {
    await api(`/sports/${sportId}/photos`, {
      method: "POST",
      body: JSON.stringify({ image, label }),
    });
    await load();
  }, [load]);

  const saveSession = useCallback(async (
    sportId: string,
    startedAt: string,
    endedAt: string,
    completedExercises: string[],
  ) => {
    const result = await api(`/sports/${sportId}/sessions`, {
      method: "POST",
      body: JSON.stringify({ startedAt, endedAt, completedExercises }),
    });
    await load();
    return result;
  }, [load]);

  const stopSport = useCallback(async (sportId: string) => {
    const result = await api<Sport>(`/sports/${sportId}/stop`, { method: "POST" });
    await load();
    return result;
  }, [load]);

  const deleteSport = useCallback(async (sportId: string) => {
    await api(`/sports/${sportId}`, { method: "DELETE" });
    await load();
  }, [load]);

  return { sports, loading, error, fetchSports, createSport, addPhoto, saveSession, stopSport, deleteSport };
}
