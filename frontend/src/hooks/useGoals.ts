import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Goal, GoalMilestone } from '../types';
import { useSocket } from './useSocket';

export function useGoals(userId: string | null) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const { on } = useSocket(userId);

  const fetchGoals = useCallback(async () => {
    try {
      const data = await api<Goal[]>('/goals');
      setGoals(data);
    } catch {
      setGoals([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
    const cleanup = on<Goal>('goal:created', (goal) => {
      setGoals((prev) => [goal, ...prev]);
    });
    const cleanup2 = on<Goal>('goal:updated', (goal) => {
      setGoals((prev) => prev.map((g) => (g.id === goal.id ? goal : g)));
    });
    const cleanup3 = on<{ id: string }>('goal:deleted', ({ id }) => {
      setGoals((prev) => prev.filter((g) => g.id !== id));
    });
    return () => {
      cleanup();
      cleanup2();
      cleanup3();
    };
  }, [fetchGoals, on]);

  const create = useCallback(async (data: Partial<Goal>) => {
    const goal = await api<Goal>('/goals', { method: 'POST', body: JSON.stringify(data) });
    setGoals((prev) => [goal, ...prev]);
    return goal;
  }, []);

  const update = useCallback(async (id: string, data: Partial<Goal>) => {
    const goal = await api<Goal>(`/goals/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    setGoals((prev) => prev.map((g) => (g.id === id ? goal : g)));
    return goal;
  }, []);

  const remove = useCallback(async (id: string) => {
    await api(`/goals/${id}`, { method: 'DELETE' });
    setGoals((prev) => prev.filter((g) => g.id !== id));
  }, []);

  const createMilestone = useCallback(async (goalId: string, data: Partial<GoalMilestone>) => {
    const milestone = await api<GoalMilestone>(`/goals/${goalId}/milestones`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    setGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, milestones: [...g.milestones, milestone] } : g)));
    return milestone;
  }, []);

  const updateMilestone = useCallback(async (goalId: string, milestoneId: string, data: Partial<GoalMilestone>) => {
    const milestone = await api<GoalMilestone>(`/goals/${goalId}/milestones/${milestoneId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    setGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, milestones: g.milestones.map((m) => (m.id === milestoneId ? milestone : m)) } : g)));
    return milestone;
  }, []);

  const deleteMilestone = useCallback(async (goalId: string, milestoneId: string) => {
    await api(`/goals/${goalId}/milestones/${milestoneId}`, { method: 'DELETE' });
    setGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, milestones: g.milestones.filter((m) => m.id !== milestoneId) } : g)));
  }, []);

  return { goals, loading, fetchGoals, create, update, remove, createMilestone, updateMilestone, deleteMilestone };
}