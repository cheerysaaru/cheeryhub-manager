import { useCallback, useEffect, useState } from 'react';
import { api, asArray } from '../services/api';
import { dedupe } from '../services/inflight';
import type { Goal, GoalMilestone } from '../types';
import { useSocket } from './useSocket';

function normalizeGoal(goal: Goal): Goal {
  return {
    ...goal,
    milestones: asArray<GoalMilestone>(goal?.milestones),
  };
}

export function useGoals(userId: string | null) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { on } = useSocket(userId);

  const fetchGoals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await dedupe('goals:list', () => api<Goal[]>('/goals'));
      setGoals(asArray<Goal>(data)
        .filter((goal): goal is Goal => Boolean(goal && typeof goal === 'object' && typeof goal.id === 'string' && typeof goal.title === 'string'))
        .map(normalizeGoal));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load goals.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoals();
    const cleanup = on<Goal>('goal:created', (goal) => {
      const normalized = normalizeGoal(goal);
      setGoals((prev) => (prev.some((g) => g.id === normalized.id) ? prev : [normalized, ...prev]));
    });
    const cleanup2 = on<Goal>('goal:updated', (goal) => {
      const normalized = normalizeGoal(goal);
      setGoals((prev) => prev.map((g) => (g.id === normalized.id ? normalized : g)));
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
    const goal = normalizeGoal(await api<Goal>('/goals', { method: 'POST', body: JSON.stringify(data) }));
    setGoals((prev) => (prev.some((g) => g.id === goal.id) ? prev : [goal, ...prev]));
    return goal;
  }, []);

  const update = useCallback(async (id: string, data: Partial<Goal>) => {
    const goal = normalizeGoal(await api<Goal>(`/goals/${id}`, { method: 'PUT', body: JSON.stringify(data) }));
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
    setGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, milestones: [...asArray<GoalMilestone>(g.milestones), milestone] } : g)));
    return milestone;
  }, []);

  const updateMilestone = useCallback(async (goalId: string, milestoneId: string, data: Partial<GoalMilestone>) => {
    const milestone = await api<GoalMilestone>(`/goals/${goalId}/milestones/${milestoneId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    setGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, milestones: asArray<GoalMilestone>(g.milestones).map((m) => (m.id === milestoneId ? milestone : m)) } : g)));
    return milestone;
  }, []);

  const deleteMilestone = useCallback(async (goalId: string, milestoneId: string) => {
    await api(`/goals/${goalId}/milestones/${milestoneId}`, { method: 'DELETE' });
    setGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, milestones: asArray<GoalMilestone>(g.milestones).filter((m) => m.id !== milestoneId) } : g)));
  }, []);

  return { goals, loading, error, fetchGoals, create, update, remove, createMilestone, updateMilestone, deleteMilestone };
}