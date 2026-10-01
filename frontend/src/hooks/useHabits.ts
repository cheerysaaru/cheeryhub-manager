import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { todayISO } from '../utils/date';
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
    weekStart: habit.weekStart ?? todayISO(),
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
  return todayISO();
}

/** Optimistically move one day's status; `null` clears the day. */
function applyDayStatus(
  habit: Habit,
  day: string,
  status: 'COMPLETED' | 'FAILED' | 'SKIPPED' | null
): Habit {
  const hadCompleted = habit.completedDates.includes(day);
  const completedDates = habit.completedDates.filter((d) => d !== day);
  const failedDates = habit.failedDates.filter((d) => d !== day);
  const skippedDates = habit.skippedDates.filter((d) => d !== day);
  if (status === 'COMPLETED') completedDates.push(day);
  if (status === 'FAILED') failedDates.push(day);
  if (status === 'SKIPPED') skippedDates.push(day);
  const completedDays = hadCompleted && status !== 'COMPLETED' ? Math.max(0, habit.completedDays - 1) : habit.completedDays + (!hadCompleted && status === 'COMPLETED' ? 1 : 0);
  const weekCompletedDays = habit.weekDates.length
    ? completedDates.filter((d) => habit.weekDates.includes(d)).length
    : habit.weekCompletedDays;
  const isToday = day === todayKey();
  return {
    ...habit,
    completedDates,
    failedDates,
    skippedDates,
    completedDays,
    weekCompletedDays,
    ...(isToday
      ? {
          completedToday: status === 'COMPLETED',
          failedToday: status === 'FAILED',
          skippedToday: status === 'SKIPPED',
        }
      : {}),
  };
}

export function useHabits(userId: string | null) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const habitsRef = useRef<Habit[]>([]);
  const { on } = useSocket(userId);

  useEffect(() => {
    habitsRef.current = habits;
  }, [habits]);

  const markPending = useCallback((id: string, busy: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const isPending = useCallback((id: string) => pendingIds.has(id), [pendingIds]);

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
    setCreating(true);
    try {
      const habit = await api<Habit>('/habits', { method: 'POST', body: JSON.stringify(data) });
      const normalized = normalizeHabit(habit);
      setHabits((prev) => prependUnique(prev, normalized));
      return normalized;
    } finally {
      setCreating(false);
    }
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

  /**
   * Applies a day-status change optimistically, waits for the server, and rolls
   * back to the pre-tap habit on failure. The server's authoritative state also
   * arrives over the socket (`habit:completed` / `habit:updated`), so no full
   * list refetch is needed after every tap.
   */
  const applyDayAction = useCallback(
    async (
      id: string,
      date: string | undefined,
      status: 'COMPLETED' | 'FAILED' | 'SKIPPED' | null,
      request: () => Promise<unknown>
    ) => {
      const day = date ?? todayKey();
      const before = habitsRef.current.find((habit) => habit.id === id);
      if (!before) return undefined;
      markPending(id, true);
      setHabits((prev) => prev.map((habit) => (habit.id === id ? applyDayStatus(habit, day, status) : habit)));
      try {
        return await request();
      } catch (error) {
        setHabits((prev) => prev.map((habit) => (habit.id === id ? before : habit)));
        console.warn('Optimistic habit update reverted', error);
        return undefined;
      } finally {
        markPending(id, false);
      }
    },
    [markPending]
  );

  const complete = useCallback(
    (id: string, date?: string) =>
      applyDayAction(id, date, 'COMPLETED', () =>
        api(`/habits/${id}/complete`, { method: 'POST', body: JSON.stringify(date ? { date } : {}) })
      ),
    [applyDayAction]
  );

  const clearToday = useCallback(
    (id: string, date?: string) =>
      applyDayAction(id, date, null, () =>
        api(`/habits/${id}/today`, { method: 'DELETE', body: JSON.stringify(date ? { date } : {}) })
      ),
    [applyDayAction]
  );

  const failToday = useCallback(
    (id: string, date?: string) =>
      applyDayAction(id, date, 'FAILED', () =>
        api(`/habits/${id}/fail`, { method: 'POST', body: JSON.stringify(date ? { date } : {}) })
      ),
    [applyDayAction]
  );

  const skipToday = useCallback(
    (id: string, date?: string) =>
      applyDayAction(id, date, 'SKIPPED', () =>
        api(`/habits/${id}/skip`, { method: 'POST', body: JSON.stringify(date ? { date } : {}) })
      ),
    [applyDayAction]
  );

  return { habits, loading, creating, isPending, fetchHabits, create, update, remove, complete, clearToday, failToday, skipToday };
}