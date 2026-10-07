const configuredApiUrl = import.meta.env.VITE_API_URL as string | undefined;
const PRODUCTION_API_URL = 'https://api.cheeryhub.space/api';

function normalizeApiUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return null;
    if (url.search || url.hash) return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

const normalizedApiUrl = normalizeApiUrl(configuredApiUrl);
if (configuredApiUrl && !normalizedApiUrl) {
  console.error('[api] Invalid VITE_API_URL; expected an absolute HTTP(S) URL such as https://api.cheeryhub.space/api.');
}
if (import.meta.env.PROD && !normalizedApiUrl) {
  console.error(`[api] Using the production API fallback: ${PRODUCTION_API_URL}`);
}

export const API_BASE: string =
  normalizedApiUrl ??
  (import.meta.env.PROD ? PRODUCTION_API_URL : 'http://localhost:4000/api');

export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 2;
const RETRY_DELAYS_MS = [400, 1200];

const queueKey = 'productivity-pending-writes';
const timerPositionKey = 'deadline-timer-position';

export type ApiErrorCode =
  | 'NETWORK_ERROR'
  | 'RATE_LIMITED'
  | 'AUTH_REQUIRED'
  | 'SESSION_EXPIRED'
  | 'ACCOUNT_DISABLED'
  | 'INVALID_REQUEST'
  | 'INTERNAL_ERROR'
  | string;

/** Every API failure surfaces as this: a friendly message plus machine details. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly requestId?: string;

  constructor(
    message: string,
    options: { status: number; code?: ApiErrorCode; requestId?: string }
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status;
    this.code = options.code ?? 'UNKNOWN';
    this.requestId = options.requestId;
  }
}

type SessionExpiredHandler = () => void;

let sessionExpiredHandler: SessionExpiredHandler | null = null;
let sessionExpiredNotified = false;
let refreshInFlight: Promise<boolean> | null = null;

/** Register a handler for "session could not be recovered" (tests / custom UI). */
export function onSessionExpired(handler: SessionExpiredHandler | null): void {
  sessionExpiredHandler = handler;
}

/** Test helper: forget the one-shot notification and any cached state. */
export function resetSessionState(): void {
  sessionExpiredHandler = null;
  sessionExpiredNotified = false;
  refreshInFlight = null;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function baseURL(): string {
  const base = (import.meta.env.BASE_URL as string | undefined) ?? '/';
  return base.endsWith('/') ? base.slice(0, -1) || '/' : base;
}

function isAuthPath(path: string): boolean {
  // Endpoints where a 401 means "wrong input", not "expired session" —
  // attempting a refresh there would mis-report failed sign-ins as expiry.
  const noRefresh = [
    '/auth/login',
    '/auth/register',
    '/auth/forgot',
    '/auth/reset',
    '/auth/logout',
    '/auth/refresh',
  ];
  return noRefresh.some((prefix) => path.startsWith(prefix));
}

function onAuthRoute(): boolean {
  if (typeof window === 'undefined') return false;
  const pathname = window.location.pathname;
  const base = baseURL();
  return pathname === base || pathname === `${base}/` || pathname.endsWith('/reset');
}

function notifySessionExpired(): void {
  if (sessionExpiredNotified) return;
  sessionExpiredNotified = true;

  if (sessionExpiredHandler) {
    sessionExpiredHandler();
    return;
  }

  // Default: clear whatever cookie is left, then explain why we are signing out.
  void fetch(`${API_BASE}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  }).catch(() => undefined);

  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  const hasNotice = url.searchParams.get('session') === 'expired';
  if (onAuthRoute()) {
    if (hasNotice) return;
    url.searchParams.set('session', 'expired');
    window.location.assign(url.toString());
    return;
  }
  window.location.assign(`${baseURL()}?session=expired`);
}

/**
 * Re-issues the session cookie server-side. Single-flight: parallel 401s from
 * several hooks share one refresh request.
 */
export function silentRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    refreshInFlight = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    })
      .then((response) => response.ok)
      .catch(() => false)
      .finally(() => {
        clearTimeout(timer);
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

type ParsedResponse = { response: Response; body: Record<string, unknown> | null };

async function fetchOnce(path: string, init?: RequestInit): Promise<ParsedResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
      signal: controller.signal,
    });

    let body: Record<string, unknown> | null = null;
    try {
      const text = await response.text();
      body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
    } catch (error) {
      if (controller.signal.aborted) throw error;
      // Non-JSON payload (proxy HTML error page, empty body) — never shown raw.
      body = null;
    }
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

function messageFor(status: number, body: Record<string, unknown> | null): string {
  const serverError = typeof body?.error === 'string' ? (body.error as string) : null;
  if (status === 429)
    return serverError ?? 'Too many requests. Please wait a moment and try again.';
  if (status === 401) return serverError ?? 'Your session has expired. Please sign in again.';
  if (status === 403) return serverError ?? 'You do not have access to this resource.';
  if (status === 404) return serverError ?? 'Not found.';
  if (status >= 500) return 'Something went wrong. Please try again.';
  if (status >= 400) return serverError ?? 'Invalid request. Please check your input and try again.';
  return serverError ?? `Request failed (${status})`;
}

function codeOf(body: Record<string, unknown> | null): string | undefined {
  return typeof body?.code === 'string' ? (body.code as string) : undefined;
}

function requestIdOf(body: Record<string, unknown> | null): string | undefined {
  return typeof body?.requestId === 'string' ? (body.requestId as string) : undefined;
}

function retryDelayMs(response: Response | null, attempt: number): number {
  const header = response?.headers.get('retry-after');
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 10_000);
  }
  return RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)] ?? 0;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const idempotent = method === 'GET' || method === 'HEAD' || method === 'PUT' || method === 'DELETE';
  const skipRefresh = isAuthPath(path) || method === 'OPTIONS';

  let attempts = 0;
  let refreshed = false;

  for (;;) {
    let response: Response | null = null;
    try {
      const { response: res, body } = await fetchOnce(path, init);
      response = res;

      if (res.ok) {
        sessionExpiredNotified = false;
        // Never resolve null/undefined: a caller doing `result.x` or
        // `data.filter(...)` must not white-screen on an empty 200 body.
        const payload = body?.data ?? body;
        return (payload === null || payload === undefined ? ({} as T) : payload) as T;
      }

      const code = codeOf(body);

      if (res.status === 401 && !skipRefresh && code === 'AUTH_REQUIRED') {
        notifySessionExpired();
        throw new ApiError(messageFor(res.status, body), {
          status: res.status,
          code,
          requestId: requestIdOf(body),
        });
      }

      if (res.status === 401 && !refreshed && !skipRefresh) {
        refreshed = true;
        if (await silentRefresh()) continue;
        notifySessionExpired();
        throw new ApiError(messageFor(res.status, body), {
          status: res.status,
          code: code ?? 'SESSION_EXPIRED',
          requestId: requestIdOf(body),
        });
      }

      if (res.status === 429 && attempts < MAX_RETRIES) {
        attempts += 1;
        await sleep(retryDelayMs(res, attempts));
        continue;
      }

      throw new ApiError(messageFor(res.status, body), {
        status: res.status,
        code: code ?? `HTTP_${res.status}`,
        requestId: requestIdOf(body),
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      // Network failure or timeout: retry only idempotent requests so a POST
      // can never be delivered twice.
      if (idempotent && attempts < MAX_RETRIES) {
        attempts += 1;
        await sleep(retryDelayMs(response, attempts));
        continue;
      }
      if (import.meta.env.DEV) {
        const target = new URL(`${API_BASE}${path}`);
        console.warn('[api] Network request failed', {
          method,
          url: `${target.origin}${target.pathname}`,
          status: response?.status ?? 0,
          errorName: error instanceof Error ? error.name : typeof error,
        });
      }
      throw new ApiError('Cannot reach the server. Please check your connection and try again.', {
        status: 0,
        code: 'NETWORK_ERROR',
      });
    }
  }
}

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

export async function syncPendingWrites(): Promise<void> {
  if (navigator.onLine) {
    await flushQueue();
  }
}
