import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import type { DailyStats, XPTransaction } from '../types';

export function useAnalytics(userId: string | null) {
  const [stats, setStats] = useState<DailyStats[]>([]);
  const [xp, setXp] = useState<{ total: number; history: XPTransaction[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    try {
      const [statsData, xpData] = await Promise.all([
        api<DailyStats[]>('/analytics'),
        api<{ total: number; history: XPTransaction[] }>('/xp'),
      ]);
      setStats(statsData);
      setXp(xpData);
    } catch {
      setStats([]);
      setXp({ total: 0, history: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

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