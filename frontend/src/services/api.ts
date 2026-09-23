const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

const queueKey = 'productivity-pending-writes';

interface PendingWrite {
  path: string;
  init: RequestInit;
}

async function flushQueue(): Promise<void> {
  const pending = JSON.parse(localStorage.getItem(queueKey) ?? '[]') as PendingWrite[];
  for (const write of pending) {
    try {
      const response = await fetch(`${API_BASE}${write.path}`, {
        ...write.init,
        credentials: 'include',
      });
      if (!response.ok) return;
    } catch {
      return;
    }
  }
  localStorage.removeItem(queueKey);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? 'Request failed');
    return body.data;
  } catch (error) {
    if (init?.method && init.method !== 'GET' && !navigator.onLine) {
      const pending = JSON.parse(localStorage.getItem(queueKey) ?? '[]') as PendingWrite[];
      pending.push({ path, init });
      localStorage.setItem(queueKey, JSON.stringify(pending));
      return undefined as T;
    }
    throw error;
  }
}

export async function syncPendingWrites(): Promise<void> {
  if (navigator.onLine) {
    await flushQueue();
  }
}

export { API_BASE };