import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Habit } from '../types';
import { useSocket } from './useSocket';

function normalizeHabit(habit: Partial<Habit> & { id: string }): Habit {
  return {
    ...habit,
    completedToday: habit.completedToday ?? false,
    failedToday: habit.failedToday ?? false,
    skippedToday: habit.skippedToday ?? false,
    completedDays: habit.completedDays ?? 0,
    weekCompletedDays: habit.weekCompletedDays ?? 0,
    weekStart: habit.weekStart ?? new Date().toISOString().slice(0, 10),
    weekDates: habit.weekDates ?? [],
    completedDates: habit.completedDates ?? [],
    failedDates: habit.failedDates ?? [],
    skippedDates: habit.skippedDates ?? [],
  } as Habit;
}

function prependUnique(list: Habit[], habit: Habit): Habit[] {
  return list.some((item) => item.id === habit.id) ? list : [habit, ...list];
}

function mergeHabit(current: Habit | undefined, incoming: Partial<Habit> & { id: string }): Habit {
  const base = current ?? ({} as Habit);
  return normalizeHabit({
    ...base,
    ...incoming,
    weekDates: incoming.weekDates?.length ? incoming.weekDates : base.weekDates ?? [],
    completedDates: incoming.completedDates ?? base.completedDates ?? [],
    failedDates: incoming.failedDates ?? base.failedDates ?? [],
    skippedDates: incoming.skippedDates ?? base.skippedDates ?? [],
    completedToday: incoming.completedToday ?? base.completedToday ?? false,
    failedToday: incoming.failedToday ?? base.failedToday ?? false,
    skippedToday: incoming.skippedToday ?? base.skippedToday ?? false,
    completedDays: incoming.completedDays ?? base.completedDays ?? 0,
    weekCompletedDays: incoming.weekCompletedDays ?? base.weekCompletedDays ?? 0,
    weekStart: incoming.weekStart ?? base.weekStart,
  });
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
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
      setHabits((prev) => prev.map((h) => (h.id === habit.id ? mergeHabit(h, habit) : h)));
    });
    const cleanup3 = on<{ id: string }>('habit:deleted', ({ id }) => {
      setHabits((prev) => prev.filter((h) => h.id !== id));
    });
    const cleanup4 = on<Habit>('habit:completed', (habit) => {
      setHabits((prev) => prev.map((h) => (h.id === habit.id ? mergeHabit(h, habit) : h)));
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
    const result = await api<{ weekCompletedDays?: number; weekComplete?: boolean }>(`/habits/${id}/complete`, { method: 'POST' });
    const today = todayKey();
    setHabits((prev) => prev.map((h) => {
      if (h.id !== id) return h;
      const already = h.completedDates.includes(today);
      return {
        ...h,
        completedToday: true,
        failedToday: false,
        skippedToday: false,
        completedDates: already ? h.completedDates : [...h.completedDates, today],
        failedDates: h.failedDates.filter((d) => d !== today),
        skippedDates: h.skippedDates.filter((d) => d !== today),
        completedDays: already ? h.completedDays : h.completedDays + 1,
        weekCompletedDays: result.weekCompletedDays ?? h.weekCompletedDays + (already || h.completedToday ? 0 : 1),
      };
    }));
    await fetchHabits();
    return result;
  }, [fetchHabits]);

  const clearToday = useCallback(async (id: string) => {
    await api(`/habits/${id}/today`, { method: 'DELETE' });
    const today = todayKey();
    setHabits((prev) => prev.map((h) => {
      if (h.id !== id) return h;
      const had = h.completedDates.includes(today);
      return {
        ...h,
        completedToday: false,
        failedToday: false,
        skippedToday: false,
        completedDates: h.completedDates.filter((d) => d !== today),
        failedDates: h.failedDates.filter((d) => d !== today),
        skippedDates: h.skippedDates.filter((d) => d !== today),
        completedDays: had ? Math.max(0, h.completedDays - 1) : h.completedDays,
        weekCompletedDays: Math.max(0, h.weekCompletedDays - (had ? 1 : 0)),
      };
    }));
    await fetchHabits();
  }, [fetchHabits]);

  const failToday = useCallback(async (id: string) => {
    await api(`/habits/${id}/fail`, { method: 'POST' });
    const today = todayKey();
    setHabits((prev) => prev.map((h) => {
      if (h.id !== id) return h;
      const had = h.completedDates.includes(today);
      return {
        ...h,
        completedToday: false,
        failedToday: true,
        skippedToday: false,
        completedDates: h.completedDates.filter((d) => d !== today),
        failedDates: h.failedDates.includes(today) ? h.failedDates : [...h.failedDates, today],
        skippedDates: h.skippedDates.filter((d) => d !== today),
        completedDays: had ? Math.max(0, h.completedDays - 1) : h.completedDays,
        weekCompletedDays: Math.max(0, h.weekCompletedDays - (had ? 1 : 0)),
      };
    }));
    await fetchHabits();
  }, [fetchHabits]);

  const skipToday = useCallback(async (id: string) => {
    await api(`/habits/${id}/skip`, { method: 'POST' });
    const today = todayKey();
    setHabits((prev) => prev.map((h) => {
      if (h.id !== id) return h;
      const had = h.completedDates.includes(today);
      return {
        ...h,
        completedToday: false,
        failedToday: false,
        skippedToday: true,
        completedDates: h.completedDates.filter((d) => d !== today),
        failedDates: h.failedDates.filter((d) => d !== today),
        skippedDates: h.skippedDates.includes(today) ? h.skippedDates : [...h.skippedDates, today],
        completedDays: had ? Math.max(0, h.completedDays - 1) : h.completedDays,
        weekCompletedDays: Math.max(0, h.weekCompletedDays - (had ? 1 : 0)),
      };
    }));
    await fetchHabits();
  }, [fetchHabits]);

  return { habits, loading, fetchHabits, create, update, remove, complete, clearToday, failToday, skipToday };
}