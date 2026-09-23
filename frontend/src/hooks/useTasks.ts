import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Task } from '../types';
import { useSocket } from './useSocket';

export function useTasks(userId: string | null) {
  const [tasks, setTasks] = useState<Task[]>([]);
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

  useEffect(() => {
    fetchTasks();
    const cleanup = on<Task>('task:created', (task) => {
      setTasks((prev) => [task, ...prev]);
    });
    const cleanup2 = on<Task>('task:updated', (task) => {
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    });
    const cleanup3 = on<{ id: string }>('task:deleted', ({ id }) => {
      setTasks((prev) => prev.filter((t) => t.id !== id));
    });
    return () => {
      cleanup();
      cleanup2();
      cleanup3();
    };
  }, [fetchTasks, on]);

  const create = useCallback(async (data: Partial<Task>) => {
    const task = await api<Task>('/tasks', { method: 'POST', body: JSON.stringify(data) });
    setTasks((prev) => [task, ...prev]);
    return task;
  }, []);

  const update = useCallback(async (id: string, data: Partial<Task>) => {
    const task = await api<Task>(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    setTasks((prev) => prev.map((t) => (t.id === id ? task : t)));
    return task;
  }, []);

  const remove = useCallback(async (id: string) => {
    await api(`/tasks/${id}`, { method: 'DELETE' });
    setTasks((prev) => prev.filter((t) => t.id !== id));
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

  return { tasks, loading, fetchTasks, create, update, remove, complete, checkIn, startTimer, stopTimer };
}