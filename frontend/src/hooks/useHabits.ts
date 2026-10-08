import { useCallback, useEffect, useRef, useState } from "react";
import { api, asArray } from "../services/api";
import { dedupe } from "../services/inflight";
import { buildWeekDateKeys } from "../utils/commitmentCalendar";
import { todayISO } from "../utils/date";
import type { Habit } from "../types";
import { useSocket } from "./useSocket";

function normalizeHabit(
  habit: Partial<Habit> & { id: string },
  timeZone?: string,
): Habit {
  const weekDates =
    habit.weekDates?.length === 7
      ? habit.weekDates
      : buildWeekDateKeys(todayISO(timeZone));
  return {
    ...habit,
    completedToday: habit.completedToday ?? false,
    failedToday: habit.failedToday ?? false,
    skippedToday: habit.skippedToday ?? false,
    completedDays: habit.completedDays ?? 0,
    weekCompletedDays: habit.weekCompletedDays ?? 0,
    weekStart: habit.weekStart ?? weekDates[0],
    weekDates:
      asArray<string>(habit.weekDates).length === 7
        ? asArray<string>(habit.weekDates)
        : weekDates,
    completedDates: asArray<string>(habit.completedDates),
    failedDates: asArray<string>(habit.failedDates),
    skippedDates: asArray<string>(habit.skippedDates),
  } as Habit;
}

function prependUnique(list: Habit[], habit: Habit): Habit[] {
  return list.some((item) => item.id === habit.id) ? list : [habit, ...list];
}

function mergeHabit(
  current: Habit | undefined,
  incoming: Partial<Habit> & { id: string },
  timeZone?: string,
): Habit {
  const base = current ?? ({} as Habit);
  return normalizeHabit(
    {
      ...base,
      ...incoming,
      weekDates:
        incoming.weekDates?.length === 7 ? incoming.weekDates : base.weekDates,
      completedDates: incoming.completedDates ?? base.completedDates ?? [],
      failedDates: incoming.failedDates ?? base.failedDates ?? [],
      skippedDates: incoming.skippedDates ?? base.skippedDates ?? [],
      completedToday: incoming.completedToday ?? base.completedToday ?? false,
      failedToday: incoming.failedToday ?? base.failedToday ?? false,
      skippedToday: incoming.skippedToday ?? base.skippedToday ?? false,
      completedDays: incoming.completedDays ?? base.completedDays ?? 0,
      weekCompletedDays:
        incoming.weekCompletedDays ?? base.weekCompletedDays ?? 0,
      weekStart: incoming.weekStart ?? base.weekStart,
    },
    timeZone,
  );
}

function todayKey(timeZone?: string): string {
  return todayISO(timeZone);
}

/** Optimistically move one day's status; `null` clears the day. */
function applyDayStatus(
  habit: Habit,
  day: string,
  status: "COMPLETED" | "FAILED" | "SKIPPED" | null,
  timeZone?: string,
): Habit {
  const hadCompleted = habit.completedDates.includes(day);
  const completedDates = habit.completedDates.filter((d) => d !== day);
  const failedDates = habit.failedDates.filter((d) => d !== day);
  const skippedDates = habit.skippedDates.filter((d) => d !== day);
  if (status === "COMPLETED") completedDates.push(day);
  if (status === "FAILED") failedDates.push(day);
  if (status === "SKIPPED") skippedDates.push(day);
  const completedDays =
    hadCompleted && status !== "COMPLETED"
      ? Math.max(0, habit.completedDays - 1)
      : habit.completedDays + (!hadCompleted && status === "COMPLETED" ? 1 : 0);
  const weekCompletedDays = habit.weekDates.length
    ? completedDates.filter((d) => habit.weekDates.includes(d)).length
    : habit.weekCompletedDays;
  const isToday = day === todayKey(timeZone);
  return {
    ...habit,
    completedDates,
    failedDates,
    skippedDates,
    completedDays,
    weekCompletedDays,
    ...(isToday
      ? {
          completedToday: status === "COMPLETED",
          failedToday: status === "FAILED",
          skippedToday: status === "SKIPPED",
        }
      : {}),
  };
}

export function useHabits(userId: string | null, timeZone?: string) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  const isPending = useCallback(
    (id: string) => pendingIds.has(id),
    [pendingIds],
  );

  const fetchHabits = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await dedupe("habits:list", () => api<Habit[]>("/habits"));
      setHabits(
        asArray<Habit>(data)
          .filter((habit): habit is Habit =>
            Boolean(
              habit &&
              typeof habit === "object" &&
              typeof habit.id === "string" &&
              typeof habit.name === "string",
            ),
          )
          .map((habit) => normalizeHabit(habit, timeZone)),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load habits.",
      );
    } finally {
      setLoading(false);
    }
  }, [timeZone]);

  useEffect(() => {
    fetchHabits();
    const cleanup = on<Habit>("habit:created", (habit) => {
      setHabits((prev) => prependUnique(prev, normalizeHabit(habit, timeZone)));
    });
    const cleanup2 = on<Habit>("habit:updated", (habit) => {
      setHabits((prev) =>
        prev.map((h) =>
          h.id === habit.id ? mergeHabit(h, habit, timeZone) : h,
        ),
      );
    });
    const cleanup3 = on<{ id: string }>("habit:deleted", ({ id }) => {
      setHabits((prev) => prev.filter((h) => h.id !== id));
    });
    const cleanup4 = on<Habit>("habit:completed", (habit) => {
      setHabits((prev) =>
        prev.map((h) =>
          h.id === habit.id ? mergeHabit(h, habit, timeZone) : h,
        ),
      );
    });
    return () => {
      cleanup();
      cleanup2();
      cleanup3();
      cleanup4();
    };
  }, [fetchHabits, on, timeZone]);

  const create = useCallback(
    async (data: Partial<Habit>) => {
      setCreating(true);
      try {
        const habit = await api<Habit>("/habits", {
          method: "POST",
          body: JSON.stringify(data),
        });
        const normalized = normalizeHabit(habit, timeZone);
        setHabits((prev) => prependUnique(prev, normalized));
        return normalized;
      } finally {
        setCreating(false);
      }
    },
    [timeZone],
  );

  const update = useCallback(
    async (id: string, data: Partial<Habit>) => {
      const habit = await api<Habit>(`/habits/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
      const normalized = normalizeHabit(habit, timeZone);
      setHabits((prev) => prev.map((h) => (h.id === id ? normalized : h)));
      return normalized;
    },
    [timeZone],
  );

  const remove = useCallback(async (id: string) => {
    await api(`/habits/${id}`, { method: "DELETE" });
    setHabits((prev) => prev.filter((h) => h.id !== id));
  }, []);

  /**
   * Applies a day-status change optimistically, waits for the server, and rolls
   * back to the pre-tap habit on failure. Returns true only when the server
   * accepted the change (so callers can e.g. offer Undo for past days).
   */
  const applyDayAction = useCallback(
    async (
      id: string,
      date: string | undefined,
      status: "COMPLETED" | "FAILED" | "SKIPPED" | null,
      request: () => Promise<unknown>,
    ): Promise<boolean> => {
      const day = date ?? todayKey(timeZone);
      const before = habitsRef.current.find((habit) => habit.id === id);
      if (!before) return false;
      markPending(id, true);
      setHabits((prev) =>
        prev.map((habit) =>
          habit.id === id
            ? applyDayStatus(habit, day, status, timeZone)
            : habit,
        ),
      );
      try {
        await request();
        return true;
      } catch (error) {
        setHabits((prev) =>
          prev.map((habit) => (habit.id === id ? before : habit)),
        );
        console.warn("Optimistic habit update reverted", error);
        return false;
      } finally {
        markPending(id, false);
      }
    },
    [markPending, timeZone],
  );

  const complete = useCallback(
    (id: string, date?: string) =>
      applyDayAction(id, date, "COMPLETED", () =>
        api(`/habits/${id}/complete`, {
          method: "POST",
          body: JSON.stringify(date ? { date } : {}),
        }),
      ),
    [applyDayAction],
  );

  const clearToday = useCallback(
    (id: string, date?: string) =>
      applyDayAction(id, date, null, () =>
        api(`/habits/${id}/today`, {
          method: "DELETE",
          body: JSON.stringify(date ? { date } : {}),
        }),
      ),
    [applyDayAction],
  );

  const failToday = useCallback(
    (id: string, date?: string) =>
      applyDayAction(id, date, "FAILED", () =>
        api(`/habits/${id}/fail`, {
          method: "POST",
          body: JSON.stringify(date ? { date } : {}),
        }),
      ),
    [applyDayAction],
  );

  const skipToday = useCallback(
    (id: string, date?: string) =>
      applyDayAction(id, date, "SKIPPED", () =>
        api(`/habits/${id}/skip`, {
          method: "POST",
          body: JSON.stringify(date ? { date } : {}),
        }),
      ),
    [applyDayAction],
  );

  return {
    habits,
    loading,
    error,
    creating,
    isPending,
    fetchHabits,
    create,
    update,
    remove,
    complete,
    clearToday,
    failToday,
    skipToday,
  };
}
