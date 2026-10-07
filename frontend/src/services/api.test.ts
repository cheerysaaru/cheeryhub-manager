import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  api,
  onSessionExpired,
  resetSessionState,
} from './api';

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

beforeEach(() => {
  resetSessionState();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api()', () => {
  it('returns the data payload on success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(200, { data: { id: 't1' } })));
    await expect(api('/tasks')).resolves.toEqual({ id: 't1' });
  });

  it('refreshes the session once and replays a request after an expired 401', async () => {
    let taskCalls = 0;
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (...args: FetchArgs) => {
      const url = String(args[0]);
      if (url.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        return jsonResponse(200, { data: { refreshed: true } });
      }
      taskCalls += 1;
      if (taskCalls === 1) {
        return jsonResponse(401, {
          error: 'Your session has expired. Please sign in again.',
          code: 'SESSION_EXPIRED',
          requestId: 'req-1',
        });
      }
      return jsonResponse(200, { data: [{ id: 't1' }] });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(api('/tasks')).resolves.toEqual([{ id: 't1' }]);
    expect(refreshCalls).toBe(1);
    expect(taskCalls).toBe(2);
  });

  it('gives up after a failed refresh, notifies once, and throws a friendly error', async () => {
    const handler = vi.fn();
    onSessionExpired(handler);

    const fetchMock = vi.fn(async (...args: FetchArgs) => {
      const url = String(args[0]);
      if (url.endsWith('/auth/refresh')) {
        return jsonResponse(401, { error: 'Authentication required', code: 'AUTH_REQUIRED' });
      }
      return jsonResponse(401, {
        error: 'Your session has expired. Please sign in again.',
        code: 'SESSION_EXPIRED',
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = await api('/tasks').catch((error: unknown) => error);
    expect(first).toBeInstanceOf(ApiError);
    expect(first as ApiError).toMatchObject({ status: 401, code: 'SESSION_EXPIRED' });
    expect((first as ApiError).message).toMatch(/expired/i);

    await api('/tasks').catch(() => undefined);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not attempt a refresh for a failed sign-in', async () => {
    const handler = vi.fn();
    onSessionExpired(handler);
    const fetchMock = vi.fn(async () =>
      jsonResponse(401, { error: 'Invalid username or password' })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      api('/auth/login', { method: 'POST', body: '{}' })
    ).rejects.toThrow('Invalid username or password');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(handler).not.toHaveBeenCalled();
  });

  it('retries a 429 honoring Retry-After and surfaces the friendly message when it persists', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) {
          return jsonResponse(
            429,
            { error: 'Too many requests. Please wait a moment and try again.', code: 'RATE_LIMITED' },
            { 'retry-after': '0' }
          );
        }
        return jsonResponse(200, { data: { ok: true } });
      })
    );

    await expect(api('/notifications')).resolves.toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  it('reports a persistent 429 with the server message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(
          429,
          { error: 'Too many requests. Please wait a moment and try again.', code: 'RATE_LIMITED' },
          { 'retry-after': '0' }
        )
      )
    );

    const error = await api('/notifications').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(429);
    expect((error as ApiError).code).toBe('RATE_LIMITED');
    expect((error as ApiError).message).toBe('Too many requests. Please wait a moment and try again.');
  });

  it('turns a raw HTML error page into a friendly message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('<html><body><h1>502 Bad Gateway</h1></body></html>', {
            status: 500,
            headers: { 'content-type': 'text/html' },
          })
      )
    );

    const error = await api('/tasks').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe('Something went wrong. Please try again.');
    expect((error as ApiError).message).not.toMatch(/html|502/i);
  });

  it('retries network failures for idempotent requests only', async () => {
    const failing = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', failing);

    const error = await api('/tasks').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
    expect((error as ApiError).code).toBe('NETWORK_ERROR');
    expect((error as ApiError).message).toBe(
      'Cannot reach the server. Please check your connection and try again.'
    );
    expect(failing).toHaveBeenCalledTimes(3);

    failing.mockClear();
    const loginError = await api('/auth/login', { method: 'POST', body: '{}' }).catch((caught: unknown) => caught);
    expect(loginError).toBeInstanceOf(ApiError);
    expect((loginError as ApiError).code).toBe('NETWORK_ERROR');
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it('logs safe request metadata in development without logging query or body secrets', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(500, { error: 'private response detail' }))
    );

    await api('/notifications?access_token=private-query-value').catch(() => undefined);

    const logged = JSON.stringify(warning.mock.calls);
    expect(logged).toContain('"method":"GET"');
    expect(logged).toContain('/api/notifications');
    expect(logged).toContain('"status":500');
    expect(logged).toContain('"errorName":"Error"');
    expect(logged).not.toContain('private-query-value');
    expect(logged).not.toContain('private response detail');
    warning.mockRestore();
  });
});
