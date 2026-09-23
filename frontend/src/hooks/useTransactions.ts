import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Transaction, WeeklyReport, MonthlyReport } from '../types';
import { useSocket } from './useSocket';

export function useTransactions(userId: string | null) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [weeklyReport, setWeeklyReport] = useState<WeeklyReport | null>(null);
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const { on } = useSocket(userId);

  const fetchTransactions = useCallback(async () => {
    try {
      const data = await api<Transaction[]>('/transactions');
      setTransactions(data);
    } catch {
      setTransactions([]);
    }
  }, []);

  const fetchReports = useCallback(async (year?: number, month?: number) => {
    try {
      const [weekly, monthly] = await Promise.all([
        api<WeeklyReport>('/transactions/report/weekly'),
        api<MonthlyReport>(`/transactions/report/monthly?year=${year ?? new Date().getFullYear()}&month=${month ?? new Date().getMonth() + 1}`),
      ]);
      setWeeklyReport(weekly);
      setMonthlyReport(monthly);
    } catch {
      setWeeklyReport(null);
      setMonthlyReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
    fetchReports();
    const cleanup = on<Transaction>('transaction:created', (tx) => {
      setTransactions((prev) => [tx, ...prev]);
    });
    const cleanup2 = on<Transaction>('transaction:updated', (tx) => {
      setTransactions((prev) => prev.map((t) => (t.id === tx.id ? tx : t)));
    });
    const cleanup3 = on<{ id: string }>('transaction:deleted', ({ id }) => {
      setTransactions((prev) => prev.filter((t) => t.id !== id));
    });
    return () => {
      cleanup();
      cleanup2();
      cleanup3();
    };
  }, [fetchTransactions, fetchReports, on]);

  const create = useCallback(async (data: Partial<Transaction>) => {
    const tx = await api<Transaction>('/transactions', { method: 'POST', body: JSON.stringify(data) });
    setTransactions((prev) => [tx, ...prev]);
    await fetchReports();
    return tx;
  }, [fetchReports]);

  const update = useCallback(async (id: string, data: Partial<Transaction>) => {
    const tx = await api<Transaction>(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    setTransactions((prev) => prev.map((t) => (t.id === id ? tx : t)));
    await fetchReports();
    return tx;
  }, [fetchReports]);

  const remove = useCallback(async (id: string) => {
    await api(`/transactions/${id}`, { method: 'DELETE' });
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    await fetchReports();
  }, [fetchReports]);

  return {
    transactions,
    weeklyReport,
    monthlyReport,
    loading,
    fetchTransactions,
    fetchReports,
    create,
    update,
    remove,
  };
}