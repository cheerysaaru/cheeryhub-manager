export type RetryOptions = {
  /** Extra attempts after the first one (default 2). */
  retries?: number;
  /** First backoff delay in ms (default 250). */
  baseDelayMs?: number;
  /** Backoff ceiling in ms (default 5000). */
  maxDelayMs?: number;
  /** Per-attempt timeout in ms (default 10000). */
  timeoutMs?: number;
  /** Called before each retry — used for logging and tests. */
  onRetry?: (info: { attempt: number; delayMs: number; status?: number }) => void;
};

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS.has(status);
}

export function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined && retryAfterMs >= 0) {
    return Math.min(retryAfterMs, maxDelayMs);
  }
  const exponential = baseDelayMs * 2 ** attempt;
  const jitter = Math.random() * baseDelayMs;
  return Math.min(exponential + jitter, maxDelayMs);
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch with an explicit timeout plus exponential backoff on 429/5xx and
 * network failures. Never throws the provider response body to the caller.
 */
export async function fetchWithRetry(
  url: string | URL,
  init: RequestInit = {},
  options: RetryOptions = {}
): Promise<Response> {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 5000;
  const timeoutMs = options.timeoutMs ?? 10_000;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response | undefined;
    try {
      response = await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }

    const shouldRetry = response ? isRetryableStatus(response.status) : true;
    if (!shouldRetry) return response as Response;

    if (attempt === retries) {
      if (response) return response;
      throw lastError;
    }

    const delayMs = backoffDelay(attempt, baseDelayMs, maxDelayMs, parseRetryAfter(response?.headers.get('retry-after') ?? null));
    options.onRetry?.({ attempt: attempt + 1, delayMs, status: response?.status });
    await sleep(delayMs);
    if (response) response.body?.cancel().catch(() => undefined);
  }

  throw lastError ?? new Error('request failed');
}

export type CircuitBreakerOptions = {
  /** Consecutive failures before the circuit opens (default 3). */
  failureThreshold?: number;
  /** How long to skip calls once open (default 60000). */
  cooldownMs?: number;
  now?: () => number;
};

/**
 * Lets one failing provider degrade gracefully instead of breaking the page:
 * once open, calls are skipped until the cooldown elapses (half-open).
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 3;
    this.cooldownMs = options.cooldownMs ?? 60_000;
    this.now = options.now ?? Date.now;
  }

  get state(): 'closed' | 'open' | 'half-open' {
    if (this.openedAt === null) return 'closed';
    if (this.now() - this.openedAt >= this.cooldownMs) return 'half-open';
    return 'open';
  }

  allow(): boolean {
    if (this.openedAt === null) return true;
    if (this.now() - this.openedAt >= this.cooldownMs) {
      this.openedAt = null;
      this.failures = 1;
      return true;
    }
    return false;
  }

  success(): void {
    this.failures = 0;
    this.openedAt = null;
  }

  failure(): void {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.openedAt = this.now();
    }
  }
}
