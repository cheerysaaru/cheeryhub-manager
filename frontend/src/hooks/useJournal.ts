import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import type { JournalEntry } from '../types';
import { useSocket } from './useSocket';

export function useJournal(userId: string | null) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const { on } = useSocket(userId);

  const fetchEntries = useCallback(async () => {
    try {
      const data = await api<JournalEntry[]>('/journal');
      setEntries(data);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEntries();
    const cleanup = on<JournalEntry>('journal:created', (entry) => {
      setEntries((prev) => [entry, ...prev]);
    });
    const cleanup2 = on<JournalEntry>('journal:updated', (entry) => {
      setEntries((prev) => prev.map((e) => (e.id === entry.id ? entry : e)));
    });
    return () => {
      cleanup();
      cleanup2();
    };
  }, [fetchEntries, on]);

  const getByDate = useCallback(async (date: string) => {
    try {
      return await api<JournalEntry>(`/journal/${date}`);
    } catch {
      return null;
    }
  }, []);

  const save = useCallback(async (data: Partial<JournalEntry>) => {
    const entry = await api<JournalEntry>('/journal', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    setEntries((prev) => {
      const exists = prev.some((e) => e.id === entry.id || (entry.date && e.date === entry.date));
      if (exists) return prev.map((e) => (e.id === entry.id || e.date === entry.date ? entry : e));
      return [entry, ...prev];
    });
    return entry;
  }, []);

  const update = useCallback(async (id: string, data: Partial<JournalEntry>) => {
    const entry = await api<JournalEntry>(`/journal/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    setEntries((prev) => prev.map((e) => (e.id === id ? entry : e)));
    return entry;
  }, []);

  return { entries, loading, fetchEntries, getByDate, save, update };
}