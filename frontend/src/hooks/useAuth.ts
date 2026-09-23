import { useCallback, useEffect, useState } from 'react';
import { api, syncPendingWrites } from '../services/api';
import type { User } from '../types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const result = await api<{ user: User }>('/auth/me');
      setUser(result.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
    syncPendingWrites();
    window.addEventListener('online', syncPendingWrites);
    return () => window.removeEventListener('online', syncPendingWrites);
  }, [fetchUser]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api<{ user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setUser(result.user);
    return result.user;
  }, []);

  const register = useCallback(async (name: string, email: string, password: string, timezone: string) => {
    const result = await api<{ user: User; verificationSent: boolean; verificationUrl?: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, timezone }),
    });
    return result;
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  return { user, loading, login, register, logout, refreshUser: fetchUser };
}