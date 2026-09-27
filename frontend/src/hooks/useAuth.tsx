import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, clearAppStorage, syncPendingWrites } from '../services/api';
import type { User } from '../types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (name: string, email: string, password: string) => Promise<User>;
  resetPassword: (email: string, name: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

async function syncTimezone(fetched: User): Promise<User> {
  const timezone = browserTimezone();
  if (!timezone || timezone === fetched.timezone) return fetched;
  try {
    await api('/settings', { method: 'PUT', body: JSON.stringify({ timezone }) });
    return { ...fetched, timezone };
  } catch {
    return fetched;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const syncedUser = useRef<string | null>(null);

  const adoptUser = useCallback(async (next: User) => {
    if (syncedUser.current !== next.id) {
      syncedUser.current = next.id;
      const synced = await syncTimezone(next);
      setUser(synced);
      return synced;
    }
    setUser(next);
    return next;
  }, []);

  const fetchUser = useCallback(async () => {
    try {
      const result = await api<{ user: User }>('/auth/me');
      await adoptUser(result.user);
    } catch {
      setUser(null);
      syncedUser.current = null;
    } finally {
      setLoading(false);
    }
  }, [adoptUser]);

  useEffect(() => {
    clearAppStorage();
    fetchUser();
    syncPendingWrites();
    window.addEventListener('online', syncPendingWrites);
    return () => window.removeEventListener('online', syncPendingWrites);
  }, [fetchUser]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api<{ user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password, timezone: browserTimezone() }),
    });
    return adoptUser(result.user);
  }, [adoptUser]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const result = await api<{ user: User }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, timezone: browserTimezone() }),
    });
    return adoptUser(result.user);
  }, [adoptUser]);

  const resetPassword = useCallback(async (email: string, name: string, newPassword: string) => {
    await api('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, name, newPassword }),
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      clearAppStorage();
      syncedUser.current = null;
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, register, resetPassword, logout, refreshUser: fetchUser }),
    [user, loading, login, register, resetPassword, logout, fetchUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
