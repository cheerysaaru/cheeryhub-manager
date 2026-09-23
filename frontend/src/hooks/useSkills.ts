import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Skill } from '../types';
import { useSocket } from './useSocket';

export function useSkills(userId: string | null) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const { on } = useSocket(userId);

  const fetchSkills = useCallback(async () => {
    try {
      const data = await api<Skill[]>('/skills');
      setSkills(data);
    } catch {
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSkills();
    const cleanup = on<Skill>('skill:created', (skill) => {
      setSkills((prev) => [skill, ...prev]);
    });
    const cleanup2 = on<Skill>('skill:updated', (skill) => {
      setSkills((prev) => prev.map((s) => (s.id === skill.id ? skill : s)));
    });
    const cleanup3 = on<{ id: string }>('skill:deleted', ({ id }) => {
      setSkills((prev) => prev.filter((s) => s.id !== id));
    });
    return () => {
      cleanup();
      cleanup2();
      cleanup3();
    };
  }, [fetchSkills, on]);

  const create = useCallback(async (data: Partial<Skill>) => {
    const skill = await api<Skill>('/skills', { method: 'POST', body: JSON.stringify(data) });
    return skill;
  }, []);

  const update = useCallback(async (id: string, data: Partial<Skill>) => {
    const skill = await api<Skill>(`/skills/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return skill;
  }, []);

  const remove = useCallback(async (id: string) => {
    await api(`/skills/${id}`, { method: 'DELETE' });
  }, []);

  return { skills, loading, fetchSkills, create, update, remove };
}