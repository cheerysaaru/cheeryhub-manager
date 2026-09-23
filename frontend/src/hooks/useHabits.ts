import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Habit } from '../types';
import { useSocket } from './useSocket';

function normalizeHabit(habit: Partial<Habit> & { id: string }): Habit {
  return {
    ...habit,
    completedToday: habit.completedToday ?? false,
    completedDays: habit.completedDays ?? 0,
    weekCompletedDays: habit.weekCompletedDays ?? 0,
    weekStart: habit.weekStart ?? new Date().toISOString().slice(0, 10),
    weekDates: habit.weekDates ?? [],
    completedDates: habit.completedDates ?? [],
  } as Habit;
}

function prependUnique(list: Habit[], habit: Habit): Habit[] {
  return list.some((item) => item.id === habit.id) ? list : [habit, ...list];
}

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
      setHabits((prev) => prependUnique(prev, normalizeHabit(habit)));
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
    const normalized = normalizeHabit(habit);
    setHabits((prev) => prependUnique(prev, normalized));
    return normalized;
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