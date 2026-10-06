import { useCallback, useEffect, useState } from 'react';
import { api, asArray } from '../services/api';
import type { BrandProject, BrandMilestone } from '../types';
import { useSocket } from './useSocket';

function normalizeProject(project: BrandProject): BrandProject {
  return {
    ...project,
    milestones: asArray<BrandMilestone>(project?.milestones),
  };
}

export function useBrand(userId: string | null) {
  const [projects, setProjects] = useState<BrandProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { on } = useSocket(userId);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<BrandProject[]>('/brand');
      setProjects(asArray<BrandProject>(data)
        .filter((project): project is BrandProject => Boolean(project && typeof project === 'object' && typeof project.id === 'string' && typeof project.title === 'string'))
        .map(normalizeProject));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load brand projects.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    const cleanup = on<BrandProject>('brand:created', (project) => {
      const normalized = normalizeProject(project);
      setProjects((prev) => (prev.some((p) => p.id === normalized.id) ? prev : [normalized, ...prev]));
    });
    const cleanup2 = on<BrandProject>('brand:updated', (project) => {
      const normalized = normalizeProject(project);
      setProjects((prev) => prev.map((p) => (p.id === normalized.id ? normalized : p)));
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
    const project = normalizeProject(await api<BrandProject>('/brand', { method: 'POST', body: JSON.stringify(data) }));
    setProjects((prev) => (prev.some((p) => p.id === project.id) ? prev : [project, ...prev]));
    return project;
  }, []);

  const update = useCallback(async (id: string, data: Partial<BrandProject>) => {
    const project = normalizeProject(await api<BrandProject>(`/brand/${id}`, { method: 'PUT', body: JSON.stringify(data) }));
    setProjects((prev) => prev.map((p) => (p.id === id ? project : p)));
    return project;
  }, []);

  const remove = useCallback(async (id: string) => {
    await api(`/brand/${id}`, { method: 'DELETE' });
    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const createMilestone = useCallback(async (projectId: string, data: Partial<BrandMilestone>) => {
    const milestone = await api<BrandMilestone>(`/brand/${projectId}/milestones`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, milestones: [...asArray<BrandMilestone>(p.milestones), milestone] } : p)));
    return milestone;
  }, []);

  const updateMilestone = useCallback(async (projectId: string, milestoneId: string, data: Partial<BrandMilestone>) => {
    const milestone = await api<BrandMilestone>(`/brand/${projectId}/milestones/${milestoneId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, milestones: asArray<BrandMilestone>(p.milestones).map((m) => (m.id === milestoneId ? milestone : m)) } : p)));
    return milestone;
  }, []);

  const deleteMilestone = useCallback(async (projectId: string, milestoneId: string) => {
    await api(`/brand/${projectId}/milestones/${milestoneId}`, { method: 'DELETE' });
    setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, milestones: asArray<BrandMilestone>(p.milestones).filter((m) => m.id !== milestoneId) } : p)));
  }, []);

  return { projects, loading, error, fetchProjects, create, update, remove, createMilestone, updateMilestone, deleteMilestone };
}