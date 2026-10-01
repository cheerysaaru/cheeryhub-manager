import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Task } from '../types';
import { useSocket } from './useSocket';

function normalizeTask(task: Partial<Task> & { id: string }): Task {
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
  const { on } = useSocket(userId);

  const fetchTasks = useCallback(async () => {
    try {
      const data = await api<Task[]>('/tasks');
      setTasks(data);
    } catch {
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTrash = useCallback(async () => {
    try {
      const data = await api<Task[]>('/tasks/trash');
      setTrash(data);
    } catch {
      setTrash([]);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    void fetchTrash();
    const cleanup = on<Task>('task:created', (task) => {
      setTasks((prev) => prependUnique(prev, normalizeTask(task)));
    });
    const cleanup2 = on<Task>('task:updated', (task) => {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? normalizeTask({ ...t, ...task }) : t)));
    });
    const cleanup3 = on<{ id: string }>('task:deleted', ({ id }) => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      setTrash((prev) => prev.filter((t) => t.id !== id));
    });
    const cleanup4 = on<Task>('task:restored', (task) => {
      setTrash((prev) => prev.filter((t) => t.id !== task.id));
      setTasks((prev) => prependUnique(prev, normalizeTask(task)));
    });
    return () => {
      cleanup();
      cleanup2();
      cleanup3();
      cleanup4();
    };
  }, [fetchTasks, fetchTrash, on]);

  const create = useCallback(async (data: Partial<Task>) => {
    const task = await api<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) });
    const normalized = normalizeTask(task);
    setTasks((prev) => prependUnique(prev, normalized));
    return normalized;
  }, []);

  const update = useCallback(async (id: string, data: Partial<Task>) => {
    const task = await api<Task>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    setTasks((prev) => prev.map((t) => (t.id === id ? task : t)));
    return task;
  }, []);

  const remove = useCallback(async (id: string) => {
    await api(`/tasks/${id}`, { method: 'DELETE' });
    setTasks((prev) => prev.filter((t) => t.id !== id));
    void fetchTrash();
  }, [fetchTrash]);

  const restore = useCallback(async (id: string) => {
    const task = await api<Task>(`/tasks/${id}/restore`, { method: 'POST' });
    const normalized = normalizeTask(task);
    setTrash((prev) => prev.filter((t) => t.id !== id));
    setTasks((prev) => prependUnique(prev, normalized));
    return normalized;
  }, []);

  const purge = useCallback(async (id: string) => {
    await api(`/tasks/${id}/permanent`, { method: 'DELETE' });
    setTrash((prev) => prev.filter((t) => t.id !== id));
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const markNotCompleted = useCallback(async (id: string) => {
    const task = await api<Task>(`/tasks/${id}/mark-not-completed`, { method: 'POST' });
    setTasks((prev) => prev.filter((t) => t.id !== id));
    void fetchTrash();
    return task;
  }, [fetchTrash]);

  const extend = useCallback(async (id: string, dueAt: string) => {
    const task = await api<Task>(`/tasks/${id}/extend`, {
      method: 'POST',
      body: JSON.stringify({ dueAt }),
    });
    const normalized = normalizeTask(task);
    setTasks((prev) => prev.map((t) => (t.id === id ? normalized : t)));
    return normalized;
  }, []);

  const complete = useCallback(async (id: string) => {
    const task = await api<Task>(`/tasks/${id}/complete`, { method: 'PATCH' });
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...task } : t)));
    return task;
  }, []);

  const checkIn = useCallback(async (id: string, checked: boolean) => {
    const result = await api<{ checkedDays: number; missedDays: number }>(`/tasks/${id}/checkin`, {
      method: 'POST',
      body: JSON.stringify({ checked }),
    });
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, checkedToday: checked, checkedDays: result.checkedDays, missedDays: result.missedDays } : t)));
    return result;
  }, []);

  const startTimer = useCallback(async (id: string) => {
    const task = await api<Task>(`/tasks/${id}/timer/start`, { method: 'POST' });
    setTasks((prev) => prev.map((t) => (t.id === id ? task : t)));
    return task;
  }, []);

  const stopTimer = useCallback(async (id: string) => {
    const task = await api<Task>(`/tasks/${id}/timer/stop`, { method: 'POST' });
    setTasks((prev) => prev.map((t) => (t.id === id ? task : t)));
    return task;
  }, []);

  return {
    tasks,
    trash,
    loading,
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