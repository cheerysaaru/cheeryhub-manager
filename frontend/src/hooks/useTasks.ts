import { useCallback, useEffect, useRef, useState } from "react";
import { api, asArray } from "../services/api";
import { dedupe } from "../services/inflight";
import type { Task } from "../types";
import { useSocket } from "./useSocket";

function normalizeTask(input: Partial<Task> & { id: string }): Task {
  const task = (input ?? {}) as Partial<Task> & { id: string };
  return {
    ...task,
    checkedToday: task.checkedToday ?? false,
    checkedDays: task.checkedDays ?? 0,
    missedDays: task.missedDays ?? 0,
    isOverdue: task.isOverdue ?? false,
  } as Task;
}

function prependUnique(list: Task[], task: Task): Task[] {
  return list.some((item) => item.id === task.id) ? list : [task, ...list];
}

export function useTasks(userId: string | null) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [trash, setTrash] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(new Set());
  const tasksRef = useRef<Task[]>([]);
  const { on } = useSocket(userId);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

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

  const loadTasks = useCallback(() => {
    return dedupe("tasks:list", () => api<Task[]>("/tasks"))
      .then((data) => {
        setTasks(
          asArray<Task>(data)
            .filter((task): task is Task =>
              Boolean(
                task &&
                typeof task === "object" &&
                typeof task.id === "string" &&
                typeof task.title === "string" &&
                typeof task.status === "string",
              ),
            )
            .map(normalizeTask),
        );
      })
      .catch((caught: unknown) => {
        setError(
          caught instanceof Error ? caught.message : "Could not load tasks.",
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const fetchTasks = useCallback(() => {
    setLoading(true);
    setError(null);
    return loadTasks();
  }, [loadTasks]);

  const fetchTrash = useCallback(async () => {
    try {
      const data = await dedupe("tasks:trash", () =>
        api<Task[]>("/tasks/trash"),
      );
      setTrash(
        asArray<Task>(data)
          .filter((task): task is Task =>
            Boolean(
              task &&
              typeof task === "object" &&
              typeof task.id === "string" &&
              typeof task.title === "string" &&
              typeof task.status === "string",
            ),
          )
          .map(normalizeTask),
      );
    } catch {
      setError("Could not load the task trash. Please retry.");
    }
  }, []);

  useEffect(() => {
    loadTasks();
    // Trash loads lazily (Trash bin / tab click) — no reason to pay for it on mount.
    const cleanup = on<Task>("task:created", (task) => {
      setTasks((prev) => prependUnique(prev, normalizeTask(task)));
    });
    const cleanup2 = on<Task>("task:updated", (task) => {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? normalizeTask({ ...t, ...task }) : t,
        ),
      );
    });
    const cleanup3 = on<{ id: string }>("task:deleted", ({ id }) => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      setTrash((prev) => prev.filter((t) => t.id !== id));
    });
    const cleanup4 = on<Task>("task:restored", (task) => {
      setTrash((prev) => prev.filter((t) => t.id !== task.id));
      setTasks((prev) => prependUnique(prev, normalizeTask(task)));
    });
    return () => {
      cleanup();
      cleanup2();
      cleanup3();
      cleanup4();
    };
  }, [loadTasks, fetchTrash, on]);

  const create = useCallback(async (data: Partial<Task>) => {
    setCreating(true);
    try {
      const task = await api<Task>("/tasks", {
        method: "POST",
        body: JSON.stringify(data),
      });
      const normalized = normalizeTask(task);
      setTasks((prev) => prependUnique(prev, normalized));
      return normalized;
    } finally {
      setCreating(false);
    }
  }, []);

  const update = useCallback(async (id: string, data: Partial<Task>) => {
    const task = await api<Task>(`/tasks/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    setTasks((prev) => prev.map((t) => (t.id === id ? task : t)));
    return task;
  }, []);

  const remove = useCallback(
    async (id: string) => {
      await api(`/tasks/${id}`, { method: "DELETE" });
      setTasks((prev) => prev.filter((t) => t.id !== id));
      void fetchTrash();
    },
    [fetchTrash],
  );

  const restore = useCallback(async (id: string) => {
    const task = await api<Task>(`/tasks/${id}/restore`, { method: "POST" });
    const normalized = normalizeTask(task);
    setTrash((prev) => prev.filter((t) => t.id !== id));
    setTasks((prev) => prependUnique(prev, normalized));
    return normalized;
  }, []);

  const purge = useCallback(async (id: string) => {
    await api(`/tasks/${id}/permanent`, { method: "DELETE" });
    setTrash((prev) => prev.filter((t) => t.id !== id));
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const markNotCompleted = useCallback(
    async (id: string) => {
      const task = await api<Task>(`/tasks/${id}/mark-not-completed`, {
        method: "POST",
      });
      setTasks((prev) => prev.filter((t) => t.id !== id));
      void fetchTrash();
      return task;
    },
    [fetchTrash],
  );

  const extend = useCallback(async (id: string, dueAt: string) => {
    const task = await api<Task>(`/tasks/${id}/extend`, {
      method: "POST",
      body: JSON.stringify({ dueAt }),
    });
    const normalized = normalizeTask(task);
    setTasks((prev) => prev.map((t) => (t.id === id ? normalized : t)));
    return normalized;
  }, []);

  const complete = useCallback(
    async (id: string) => {
      const before = tasksRef.current.find((task) => task.id === id);
      if (!before) return undefined;
      markPending(id, true);
      // Optimistic: the row leaves the active list immediately.
      setTasks((prev) =>
        prev.map((task) =>
          task.id === id
            ? {
                ...task,
                status: "COMPLETED",
                completedAt: new Date().toISOString(),
              }
            : task,
        ),
      );
      try {
        const task = await api<Task>(`/tasks/${id}/complete`, {
          method: "PATCH",
        });
        setTasks((prev) =>
          prev.map((t) => (t.id === id ? { ...t, ...task } : t)),
        );
        return task;
      } catch (error) {
        setTasks((prev) => prev.map((t) => (t.id === id ? before : t)));
        console.warn("Optimistic complete reverted", error);
        return undefined;
      } finally {
        markPending(id, false);
      }
    },
    [markPending],
  );

  const checkIn = useCallback(
    async (id: string, checked: boolean) => {
      const before = tasksRef.current.find((task) => task.id === id);
      if (!before) return undefined;
      markPending(id, true);
      setTasks((prev) =>
        prev.map((t) => (t.id === id ? { ...t, checkedToday: checked } : t)),
      );
      try {
        const result = await api<{ checkedDays: number; missedDays: number }>(
          `/tasks/${id}/checkin`,
          {
            method: "POST",
            body: JSON.stringify({ checked }),
          },
        );
        setTasks((prev) =>
          prev.map((t) =>
            t.id === id
              ? {
                  ...t,
                  checkedToday: checked,
                  checkedDays: result.checkedDays,
                  missedDays: result.missedDays,
                }
              : t,
          ),
        );
        return result;
      } catch (error) {
        setTasks((prev) => prev.map((t) => (t.id === id ? before : t)));
        console.warn("Optimistic check-in reverted", error);
        return undefined;
      } finally {
        markPending(id, false);
      }
    },
    [markPending],
  );

  const startTimer = useCallback(async (id: string) => {
    const task = await api<Task>(`/tasks/${id}/timer/start`, {
      method: "POST",
    });
    setTasks((prev) => prev.map((t) => (t.id === id ? task : t)));
    return task;
  }, []);

  const stopTimer = useCallback(async (id: string) => {
    const task = await api<Task>(`/tasks/${id}/timer/stop`, { method: "POST" });
    setTasks((prev) => prev.map((t) => (t.id === id ? task : t)));
    return task;
  }, []);

  return {
    tasks,
    trash,
    loading,
    error,
    creating,
    isPending,
    fetchTasks,
    fetchTrash,
    create,
    update,
    remove,
    restore,
    purge,
    markNotCompleted,
    extend,
    complete,
    checkIn,
    startTimer,
    stopTimer,
  };
}
