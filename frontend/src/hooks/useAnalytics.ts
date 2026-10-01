import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
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
  const { on } = useSocket(userId);

  const fetchAnalytics = useCallback(async () => {
    try {
      const [statsPayload, xpData, streakData] = await Promise.all([
        api<{ stats?: DailyStats[] } | DailyStats[]>('/analytics'),
        api<{ total: number; history: XPTransaction[] }>('/xp'),
        api<StreakInfo>('/streaks'),
      ]);
      const stats = Array.isArray(statsPayload) ? statsPayload : (statsPayload.stats ?? []);
      setStats(stats);
      setXp(xpData);
      setStreak(streakData);
    } catch {
      setStats([]);
      setXp({ total: 0, history: [] });
      setStreak(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAnalytics();
  }, [fetchAnalytics]);

  useEffect(() => {
    const cleanup = on<{ total?: number }>('xp:updated', () => {
      void fetchAnalytics();
    });
    const cleanupHabits = on('habit:updated', () => {
      void fetchAnalytics();
    });
    const cleanupTasks = on('task:updated', () => {
      void fetchAnalytics();
    });
    return () => {
      cleanup();
      cleanupHabits();
      cleanupTasks();
    };
  }, [fetchAnalytics, on]);

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

  return { stats, xp, streak, loading, fetchAnalytics, exportBackup, importBackup };
}