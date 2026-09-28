import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { useSocket } from './useSocket';
import type { DailyStats, XPTransaction } from '../types';

export function useAnalytics(userId: string | null) {
  const [stats, setStats] = useState<DailyStats[]>([]);
  const [xp, setXp] = useState<{ total: number; history: XPTransaction[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const { on } = useSocket(userId);

  const fetchAnalytics = useCallback(async () => {
    try {
      const [statsPayload, xpData] = await Promise.all([
        api<{ stats?: DailyStats[] } | DailyStats[]>('/analytics'),
        api<{ total: number; history: XPTransaction[] }>('/xp'),
      ]);
      const stats = Array.isArray(statsPayload) ? statsPayload : (statsPayload.stats ?? []);
      setStats(stats);
      setXp(xpData);
    } catch {
      setStats([]);
      setXp({ total: 0, history: [] });
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
    return cleanup;
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

  return { stats, xp, loading, fetchAnalytics, exportBackup, importBackup };
}