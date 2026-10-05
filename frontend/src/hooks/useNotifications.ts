import { useCallback, useEffect, useState } from 'react';
import { api, asArray } from '../services/api';
import { useSocket } from './useSocket';
import type { AppNotification } from '../types';

export function useNotifications(userId: string | null) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { on } = useSocket(userId);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data: unknown = await api<unknown>('/notifications');
      const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {};
      setItems(asArray<AppNotification>(payload.items));
      setUnreadCount(typeof payload.unreadCount === 'number' ? payload.unreadCount : 0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchNotifications();
    const cleanupCreate = on<AppNotification>('notification:created', (notification) => {
      setItems((prev) =>
        prev.some((item) => item.id === notification.id) ? prev : [notification, ...prev]
      );
      setUnreadCount((count) => count + 1);
    });
    const cleanupRead = on<{ id: string }>('notification:read', ({ id }) => {
      setItems((prev) =>
        prev.map((item) => (item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item))
      );
      setUnreadCount((count) => Math.max(0, count - 1));
    });
    const cleanupAll = on('notification:read-all', () => {
      const now = new Date().toISOString();
      setItems((prev) => prev.map((item) => ({ ...item, readAt: item.readAt ?? now })));
      setUnreadCount(0);
    });
    return () => {
      cleanupCreate();
      cleanupRead();
      cleanupAll();
    };
  }, [fetchNotifications, on]);

  const markRead = useCallback(async (id: string) => {
    const target = items.find((item) => item.id === id);
    if (target?.readAt) return;
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item))
    );
    setUnreadCount((count) => Math.max(0, count - 1));
    try {
      await api(`/notifications/${id}/read`, { method: 'POST' });
    } catch {
      void fetchNotifications();
    }
  }, [fetchNotifications, items]);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((item) => ({ ...item, readAt: item.readAt ?? now })));
    setUnreadCount(0);
    try {
      await api('/notifications/read-all', { method: 'POST' });
    } catch {
      void fetchNotifications();
    }
  }, [fetchNotifications]);

  return { items, unreadCount, loading, error, fetchNotifications, markRead, markAllRead };
}
