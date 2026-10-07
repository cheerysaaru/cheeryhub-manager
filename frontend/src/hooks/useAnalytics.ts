import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
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
    const payload = await dedupe('analytics:stats', () =>
      api<{ stats?: DailyStats[] } | DailyStats[]>('/analytics')
    );
    const next = Array.isArray(payload) ? payload : (payload.stats ?? []);
    if (mountedRef.current) setStats(next);
  }, []);

  const fetchXp = useCallback(async () => {
    const data = await dedupe('analytics:xp', () =>
      api<{ total: number; history: XPTransaction[] }>('/xp')
    );
    if (mountedRef.current) setXp(data);
  }, []);

  const fetchStreaks = useCallback(async () => {
    const data = await dedupe('analytics:streaks', () => api<StreakInfo>('/streaks'));
    if (mountedRef.current) setStreak(data);
  }, []);

  const reportError = useCallback((caught: unknown) => {
    if (!mountedRef.current) return;
    setError(
      caught instanceof Error
        ? caught.message
        : 'Unable to load analytics right now. Please try again.'
    );
  }, []);

  const fetchAnalytics = useCallback(async () => {
    if (mountedRef.current) {
      setLoading(true);
      setError(null);
    }
    try {
      await Promise.all([fetchStats(), fetchXp(), fetchStreaks()]);
    } catch (caught) {
      reportError(caught);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [fetchStats, fetchXp, fetchStreaks, reportError]);

  useEffect(() => {
    void fetchAnalytics();
  }, [fetchAnalytics]);

  // Targeted refreshes: one event updates only what it can affect instead of
  // re-fetching all three endpoints (the old pattern fired 3 GETs per event).
  useEffect(() => {
    const cleanups = [
      on('xp:updated', () => {
        void fetchXp().catch(reportError);
      }),
      on('habit:updated', () => {
        void fetchStreaks().catch(reportError);
      }),
      on('task:updated', () => {
        void fetchStreaks().catch(reportError);
      }),
    ];
    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [fetchXp, fetchStreaks, on, reportError]);

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
