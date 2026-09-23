import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Reminder } from '../types';
import { useSocket } from './useSocket';

export function useReminders(userId: string | null) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const { on } = useSocket(userId);

  const fetchReminders = useCallback(async () => {
    try {
      const data = await api<Reminder[]>('/reminders');
      setReminders(data);
    } catch {
      setReminders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReminders();
    const cleanup = on<Reminder>('reminder:created', (reminder) => {
      setReminders((prev) => [reminder, ...prev]);
    });
    const cleanup2 = on<Reminder>('reminder:updated', (reminder) => {
      setReminders((prev) => prev.map((r) => (r.id === reminder.id ? reminder : r)));
    });
    const cleanup3 = on<{ id: string }>('reminder:deleted', ({ id }) => {
      setReminders((prev) => prev.filter((r) => r.id !== id));
    });
    return () => {
      cleanup();
      cleanup2();
      cleanup3();
    };
  }, [fetchReminders, on]);

  const create = useCallback(async (data: Partial<Reminder>) => {
    const reminder = await api<Reminder>('/reminders', { method: 'POST', body: JSON.stringify(data) });
    return reminder;
  }, []);

  const update = useCallback(async (id: string, data: Partial<Reminder>) => {
    const reminder = await api<Reminder>(`/reminders/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return reminder;
  }, []);

  const remove = useCallback(async (id: string) => {
    await api(`/reminders/${id}`, { method: 'DELETE' });
  }, []);

  return { reminders, loading, fetchReminders, create, update, remove };
}