/**
 * In-flight request sharing for GETs: concurrent callers (multiple hook
 * instances, StrictMode double-effects, badge + page fetching the same list)
 * await one network round-trip instead of firing duplicates.
 */
const inflight = new Map<string, Promise<unknown>>();

export function dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const promise = run().finally(() => {
    if (inflight.get(key) === promise) inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}
