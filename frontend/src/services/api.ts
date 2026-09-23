const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

const queueKey = 'productivity-pending-writes';
const timerPositionKey = 'deadline-timer-position';

export function clearAppStorage(): void {
  try {
    localStorage.removeItem(queueKey);
    localStorage.removeItem(timerPositionKey);
  } catch {
    /* Storage may be unavailable. */
  }
}

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
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
  } catch {
    throw new Error('Cannot reach the server. Make sure the backend is running on port 4000.');
  }
  let body: { data?: T; error?: string };
  try {
    body = await response.json();
  } catch {
    throw new Error(response.ok ? 'Invalid server response' : `Request failed (${response.status})`);
  }
  if (!response.ok) throw new Error(body.error ?? 'Request failed');
  return body.data as T;
}

export async function syncPendingWrites(): Promise<void> {
  if (navigator.onLine) {
    await flushQueue();
  }
}

export { API_BASE };