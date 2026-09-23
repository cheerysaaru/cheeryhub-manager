import { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import type { FocusSession } from '../types';
import { useSocket } from './useSocket';

export function useFocus(userId: string | null) {
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const [loading, setLoading] = useState(true);
  const { on } = useSocket(userId);

  const fetchSessions = useCallback(async () => {
    try {
      const data = await api<FocusSession[]>('/focus/history');
      setSessions(data);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    const cleanup = on<FocusSession>('focus:created', (session) => {
      setSessions((prev) => [session, ...prev]);
    });
    const cleanup2 = on<FocusSession>('focus:completed', (session) => {
      setSessions((prev) => prev.map((s) => (s.id === session.id ? session : s)));
    });
    return () => {
      cleanup();
      cleanup2();
    };
  }, [fetchSessions, on]);

  const start = useCallback(async (durationMinutes: number, taskId?: string) => {
    const session = await api<FocusSession>('/focus/start', {
      method: 'POST',
      body: JSON.stringify({ durationMinutes, taskId }),
    });
    return session;
  }, []);

  const complete = useCallback(async (id: string) => {
    const session = await api<FocusSession>(`/focus/${id}/complete`, { method: 'POST' });
    return session;
  }, []);

  return { sessions, loading, fetchSessions, start, complete };
}