/**
 * In-memory GET-response cache with TTL.
 *
 * The in-flight dedupe (inflight.ts) prevents concurrent duplicate requests,
 * but on navigation each tab still re-fetches from the network even if the
 * data hasn't changed. This cache keeps the last response for 30 seconds so
 * repeated navigation within that window is served from memory.
 *
 * Invalidated automatically by:
 *  - TTL expiry (30s for most endpoints, 5s for points/dashboard which change
 *    frequently during a session)
 *  - Explicit purgeCache(key) calls after mutations
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const GET_CACHE = new Map<string, CacheEntry<unknown>>();
const DEFAULT_TTL_MS = 30_000;
const FAST_TTL_MS = 5_000;

// Keys that should use a short TTL because they change often during a session
const FAST_KEYS = new Set(["points:summary", "dashboard:stats"]);

export function getFromCache<T>(key: string): T | null {
  const entry = GET_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    GET_CACHE.delete(key);
    return null;
  }
  return entry.data as T;
}

export function setCache<T>(key: string, data: T, ttlMs = DEFAULT_TTL_MS): void {
  GET_CACHE.set(key, { data, expiresAt: Date.now() + ttlMs });
  // Prune entries that already expired while we were busy
  if (GET_CACHE.size > 200) {
    const now = Date.now();
    for (const [k, v] of GET_CACHE) {
      if (now > v.expiresAt) GET_CACHE.delete(k);
    }
  }
}

export function purgeCache(key: string): void {
  GET_CACHE.delete(key);
}

export function cacheTtl(key: string): number {
  return FAST_KEYS.has(key) ? FAST_TTL_MS : DEFAULT_TTL_MS;
}

export function clearAllCache(): void {
  GET_CACHE.clear();
}
