/**
 * Tiny in-memory TTL cache with stampede protection.
 *
 * - `cached()` returns the cached value while fresh, dedupes concurrent
 *   misses onto a single in-flight promise, and refreshes in background
 *   when served stale (soft-TTL → hard-TTL), so p99 stays flat even when
 *   a hot key expires under load.
 * - No Redis / external middleware — matches the local-memory caching
 *   policy of the stack and is ideal for single-instance deployments.
 */

interface Entry {
  value: unknown;
  softExpires: number; // serve fresh before this
  hardExpires: number; // after this the value is unusable
}

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

const MAX_KEYS = 500;

function sweep(now: number) {
  if (store.size <= MAX_KEYS) return;
  // drop expired + oldest soft-expired entries until we are back under budget
  for (const [k, e] of store) {
    if (e.hardExpires < now) store.delete(k);
  }
  if (store.size > MAX_KEYS) {
    const sorted = [...store.entries()].sort((a, b) => a[1].softExpires - b[1].softExpires);
    for (let i = 0; i < sorted.length - MAX_KEYS; i++) store.delete(sorted[i][0]);
  }
}

export function cacheGet<T>(key: string): { value: T; stale: boolean } | null {
  const e = store.get(key);
  if (!e) return null;
  const now = Date.now();
  if (e.hardExpires < now) {
    store.delete(key);
    return null;
  }
  return { value: e.value as T, stale: e.softExpires < now };
}

export function cacheSet<T>(key: string, value: T, softTtlMs: number, hardTtlMs = softTtlMs * 3) {
  const now = Date.now();
  store.set(key, { value, softExpires: now + softTtlMs, hardExpires: now + hardTtlMs });
  sweep(now);
}

/** Cache-aside helper with background refresh on stale reads. */
export async function cached<T>(key: string, softTtlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit) {
    if (hit.stale && !inflight.has(key)) {
      // background refresh — caller keeps getting snappy responses
      const p = (async () => {
        try {
          const v = await fn();
          cacheSet(key, v, softTtlMs);
        } catch {
          /* keep serving stale */
        } finally {
          inflight.delete(key);
        }
      })();
      inflight.set(key, p);
    }
    return hit.value;
  }
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = (async () => {
    try {
      const v = await fn();
      cacheSet(key, v, softTtlMs);
      return v;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
  return p as Promise<T>;
}

/** Invalidate keys sharing a prefix (call after mutations / syncs). */
export function cacheInvalidate(prefix: string) {
  for (const k of store.keys()) if (k.startsWith(prefix)) store.delete(k);
}
