import { useCallback, useEffect, useRef, useState } from 'react';
import { api, asArray } from '../services/api';
import { dedupe } from '../services/inflight';
import { useSocket } from './useSocket';
import type { DailyStats, XPTransaction } from '../types';

export interface StreakInfo {
  current: number;
  best: number;
  todayActive: boolean;
}

export function useAnalytics(userId: string | null) {
  const [stats, setStats] = useState<DailyStats[]>([]);
  const [xp, setXp] = useState<{ total: number; history: XPTransaction[] } | null>(null);
  const [streak, setStreak] = useState<StreakInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { on } = useSocket(userId);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchStats = useCallback(async () => {
    const payload: unknown = await dedupe('analytics:stats', () => api<unknown>('/analytics'));
    const next = Array.isArray(payload)
      ? payload
      : payload && typeof payload === 'object' && 'stats' in payload
        ? asArray<DailyStats>(payload.stats)
        : [];
    if (mountedRef.current) setStats(asArray<DailyStats>(next));
  }, []);

  const fetchXp = useCallback(async () => {
    const data: unknown = await dedupe('analytics:xp', () => api<unknown>('/xp'));
    const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    if (mountedRef.current) {
      setXp({
        total: typeof payload.total === 'number' ? payload.total : 0,
        history: asArray<XPTransaction>(payload.history),
      });
    }
  }, []);

  const fetchStreaks = useCallback(async () => {
    const data: unknown = await dedupe('analytics:streaks', () => api<unknown>('/streaks'));
    if (mountedRef.current && data && typeof data === 'object') {
      const payload = data as Partial<StreakInfo>;
      setStreak({
        current: typeof payload.current === 'number' ? payload.current : 0,
        best: typeof payload.best === 'number' ? payload.best : 0,
        todayActive: payload.todayActive === true,
      });
    }
  }, []);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchStats(), fetchXp(), fetchStreaks()]);
    } catch (caught) {
      if (mountedRef.current) setError(caught instanceof Error ? caught.message : 'Could not load analytics.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [fetchStats, fetchXp, fetchStreaks]);

  useEffect(() => {
    void fetchAnalytics();
  }, [fetchAnalytics]);

  // Targeted refreshes: one event updates only what it can affect instead of
  // re-fetching all three endpoints (the old pattern fired 3 GETs per event).
  useEffect(() => {
    const cleanups = [
      on('xp:updated', () => {
        void fetchXp().catch(() => undefined);
      }),
      on('habit:updated', () => {
        void fetchStreaks().catch(() => undefined);
      }),
      on('task:updated', () => {
        void fetchStreaks().catch(() => undefined);
      }),
    ];
    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [fetchXp, fetchStreaks, on]);

  const exportBackup = useCallback(async () => {
    const data = await api<Blob>('/backup/export');
    return data;
  }, []);

  const importBackup = useCallback(async (data: unknown) => {
    const result = await api('/backup/import', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return result;
  }, []);

  return { stats, xp, streak, loading, error, fetchAnalytics, exportBackup, importBackup };
}
