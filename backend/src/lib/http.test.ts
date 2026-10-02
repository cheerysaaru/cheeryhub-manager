import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CircuitBreaker, backoffDelay, fetchWithRetry, isRetryableStatus } from './http';

function jsonResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify({ ok: status < 400 }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('backoffDelay', () => {
  it('grows exponentially and respects the ceiling', () => {
    const first = backoffDelay(0, 250, 5000);
    const third = backoffDelay(2, 250, 5000);
    expect(first).toBeGreaterThanOrEqual(250);
    expect(first).toBeLessThan(500);
    expect(third).toBeGreaterThanOrEqual(1000);
    expect(backoffDelay(10, 250, 5000)).toBeLessThanOrEqual(5000);
  });

  it('prefers an explicit Retry-After hint', () => {
    expect(backoffDelay(0, 250, 5000, 1500)).toBe(1500);
    expect(backoffDelay(0, 250, 5000, 99_000)).toBe(5000);
  });
});

describe('isRetryableStatus', () => {
  it('retries rate limits and transient server errors only', () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      expect(isRetryableStatus(status)).toBe(true);
    }
    for (const status of [200, 201, 400, 401, 403, 404, 418]) {
      expect(isRetryableStatus(status)).toBe(false);
    }
  });
});

describe('fetchWithRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries a 429 honoring Retry-After, then succeeds', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(429, { 'retry-after': '0' }))
      .mockResolvedValueOnce(jsonResponse(200));
    const onRetry = vi.fn();

    const promise = fetchWithRetry('https://api.example.com/emails', {}, { retries: 2, baseDelayMs: 10, onRetry });
    await vi.runAllTimersAsync();
    const response = await promise;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0][0].status).toBe(429);
  });

  it('gives up after the configured number of attempts', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(503));

    const promise = fetchWithRetry('https://api.example.com/emails', {}, { retries: 2, baseDelayMs: 5 });
    await vi.runAllTimersAsync();
    const response = await promise;

    expect(response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a client error', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(400));

    const response = await fetchWithRetry('https://api.example.com/emails', {}, { retries: 3, baseDelayMs: 5 });

    expect(response.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries network failures and rethrows the last error', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValue(jsonResponse(200));

    const promise = fetchWithRetry('https://api.example.com/emails', {}, { retries: 2, baseDelayMs: 5 });
    await vi.runAllTimersAsync();
    const response = await promise;

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('CircuitBreaker', () => {
  it('opens after repeated failures and recovers after the cooldown', () => {
    let now = 1_000;
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      cooldownMs: 1000,
      now: () => now,
    });

    expect(breaker.allow()).toBe(true);
    breaker.failure();
    breaker.failure();
    expect(breaker.state).toBe('closed');
    breaker.failure();
    expect(breaker.state).toBe('open');
    expect(breaker.allow()).toBe(false);

    now += 999;
    expect(breaker.allow()).toBe(false);

    now += 2;
    expect(breaker.state).toBe('half-open');
    expect(breaker.allow()).toBe(true);

    breaker.success();
    expect(breaker.state).toBe('closed');
    expect(breaker.allow()).toBe(true);
  });

  it('keeps failing closed after a half-open attempt fails', () => {
    let now = 0;
    const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 100, now: () => now });
    breaker.failure();
    breaker.failure();
    expect(breaker.state).toBe('open');
    now += 200;
    expect(breaker.allow()).toBe(true);
    breaker.failure();
    expect(breaker.state).toBe('open');
    expect(breaker.allow()).toBe(false);
  });
});
