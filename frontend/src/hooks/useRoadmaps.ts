import { useCallback, useEffect, useState } from "react";
import { api, asArray } from "../services/api";
import { dedupe } from "../services/inflight";
import { useSocket } from "./useSocket";

export function useRoadmaps(userId: any) {
  const [roadmaps, setRoadmaps] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { on, emit } = useSocket(userId);

  const loadRoadmaps = useCallback(() => {
    return dedupe("roadmaps:list", () => api<any[]>("/roadmaps"))
      .then((data) => {
        setRoadmaps(asArray<any>(data));
      })
      .catch((caught: any) => {
        setError(caught instanceof Error ? caught.message : "Could not load roadmaps.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const fetchRoadmaps = useCallback(() => {
    setLoading(true);
    setError(null);
    return loadRoadmaps();
  }, [loadRoadmaps]);

  useEffect(() => {
    loadRoadmaps();
  }, [loadRoadmaps]);

  const createRoadmap = useCallback(async (data: any) => {
    const result = await api("/roadmaps", { method: "POST", body: JSON.stringify(data) });
    await loadRoadmaps();
    return result;
  }, [loadRoadmaps]);

  const updateRoadmap = useCallback(async (data: any) => {
    const result = await api("/roadmaps/" + data.id, { method: "PATCH", body: JSON.stringify(data) });
    await loadRoadmaps();
    return result;
  }, [loadRoadmaps]);

  const completeDay = useCallback(async (roadmapId: string, dayId: string, whatILearned: string) => {
    const result = await api("/roadmaps/" + roadmapId + "/days/" + dayId + "/complete", { method: "PATCH", body: JSON.stringify({ completed: true, whatILearned }) });
    await loadRoadmaps();
    emit("notification:created", {
      id: crypto.randomUUID(),
      userId: userId,
      type: "roadmap_day_completed",
      title: "Roadmap Day Completed",
      body: `You completed a day in your roadmap`,
      link: `/roadmaps/${roadmapId}`,
    });
    return result;
  }, [loadRoadmaps, emit, userId]);

  const deleteRoadmap = useCallback(async (roadmapId: string) => {
    const result = await api("/roadmaps/" + roadmapId, { method: "DELETE" });
    await loadRoadmaps();
    return result;
  }, [loadRoadmaps]);

  return { roadmaps, loading, error, fetchRoadmaps, createRoadmap, updateRoadmap, completeDay, deleteRoadmap };
}