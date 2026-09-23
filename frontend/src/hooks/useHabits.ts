import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Habit } from '../types';
import { useSocket } from './useSocket';

export function useHabits(userId: string | null) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const { on } = useSocket(userId);

  const fetchHabits = useCallback(async () => {
    try {
      const data = await api<Habit[]>('/habits');
      setHabits(data);
    } catch {
      setHabits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHabits();
    const cleanup = on<Habit>('habit:created', (habit) => {
      setHabits((prev) => [habit, ...prev]);
    });
    const cleanup2 = on<Habit>('habit:updated', (habit) => {
      setHabits((prev) => prev.map((h) => (h.id === habit.id ? habit : h)));
    });
    const cleanup3 = on<{ id: string }>('habit:deleted', ({ id }) => {
      setHabits((prev) => prev.filter((h) => h.id !== id));
    });
    const cleanup4 = on<Habit>('habit:completed', (habit) => {
      setHabits((prev) => prev.map((h) => (h.id === habit.id ? habit : h)));
    });
    return () => {
      cleanup();
      cleanup2();
      cleanup3();
      cleanup4();
    };
  }, [fetchHabits, on]);

  const create = useCallback(async (data: Partial<Habit>) => {
    const habit = await api<Habit>('/habits', { method: 'POST', body: JSON.stringify(data) });
    setHabits((prev) => [habit, ...prev]);
    return habit;
  }, []);

  const update = useCallback(async (id: string, data: Partial<Habit>) => {
    const habit = await api<Habit>(`/habits/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    setHabits((prev) => prev.map((h) => (h.id === id ? habit : h)));
    return habit;
  }, []);

  const remove = useCallback(async (id: string) => {
    await api(`/habits/${id}`, { method: 'DELETE' });
    setHabits((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const complete = useCallback(async (id: string) => {
    const result = await api<Habit>(`/habits/${id}/complete`, { method: 'POST' });
    await fetchHabits();
    return result;
  }, [fetchHabits]);

  const clearToday = useCallback(async (id: string) => {
    await api(`/habits/${id}/today`, { method: 'DELETE' });
    await fetchHabits();
  }, [fetchHabits]);

  return { habits, loading, fetchHabits, create, update, remove, complete, clearToday };
}