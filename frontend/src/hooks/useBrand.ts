import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import type { BrandProject, BrandMilestone } from '../types';
import { useSocket } from './useSocket';

export function useBrand(userId: string | null) {
  const [projects, setProjects] = useState<BrandProject[]>([]);
  const [loading, setLoading] = useState(true);
  const { on } = useSocket(userId);

  const fetchProjects = useCallback(async () => {
    try {
      const data = await api<BrandProject[]>('/brand');
      setProjects(data);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    const cleanup = on<BrandProject>('brand:created', (project) => {
      setProjects((prev) => [project, ...prev]);
    });
    const cleanup2 = on<BrandProject>('brand:updated', (project) => {
      setProjects((prev) => prev.map((p) => (p.id === project.id ? project : p)));
    });
    const cleanup3 = on<{ id: string }>('brand:deleted', ({ id }) => {
      setProjects((prev) => prev.filter((p) => p.id !== id));
    });
    return () => {
      cleanup();
      cleanup2();
      cleanup3();
    };
  }, [fetchProjects, on]);

  const create = useCallback(async (data: Partial<BrandProject>) => {
    const project = await api<BrandProject>('/brand', { method: 'POST', body: JSON.stringify(data) });
    return project;
  }, []);

  const update = useCallback(async (id: string, data: Partial<BrandProject>) => {
    const project = await api<BrandProject>(`/brand/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return project;
  }, []);

  const remove = useCallback(async (id: string) => {
    await api(`/brand/${id}`, { method: 'DELETE' });
  }, []);

  const createMilestone = useCallback(async (projectId: string, data: Partial<BrandMilestone>) => {
    const milestone = await api<BrandMilestone>(`/brand/${projectId}/milestones`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return milestone;
  }, []);

  const updateMilestone = useCallback(async (projectId: string, milestoneId: string, data: Partial<BrandMilestone>) => {
    const milestone = await api<BrandMilestone>(`/brand/${projectId}/milestones/${milestoneId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return milestone;
  }, []);

  const deleteMilestone = useCallback(async (projectId: string, milestoneId: string) => {
    await api(`/brand/${projectId}/milestones/${milestoneId}`, { method: 'DELETE' });
  }, []);

  return { projects, loading, fetchProjects, create, update, remove, createMilestone, updateMilestone, deleteMilestone };
}