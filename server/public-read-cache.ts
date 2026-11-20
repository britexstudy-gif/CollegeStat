/** Bounded, short-lived cache for anonymous published data only.
 * Do not use this for sessions, staff queries, user drafts or account preferences.
 */
export function publicReadCache<Value>(
  maximumEntries: number,
  ttlMs = 60000,
  now: () => number = Date.now,
  pendingLifetimeMs = 45000,
) {
  if (!Number.isInteger(maximumEntries) || maximumEntries < 1 || ttlMs < 1)
    throw new RangeError(
      "Public read cache requires a positive capacity and lifetime.",
    );
  type Entry = { value?: Value; expires: number; request?: Promise<Value> };
  const entries = new Map<string, Entry>();
  return async (key: string, load: () => Promise<Value>): Promise<Value> => {
    const cached = entries.get(key);
    if (cached && cached.expires > now()) {
      // Move a read entry to the end so eviction removes the least recently used.
      entries.delete(key);
      entries.set(key, cached);
      if (!cached.request) return cached.value as Value;
      // The shared fill may belong to another HTTP request. In Workers its I/O
      // is cancelled when that request ends (e.g. the root layout's 350 ms race
      // against the bundled snapshot), and its promise then never settles.
      // Waiters stop at the entry's pending deadline and load for themselves
      // instead of hanging indefinitely.
      const pending = cached.request;
      return new Promise<Value>((resolve, reject) => {
        const timer = setTimeout(
          () => {
            if (entries.get(key) === cached) entries.delete(key);
            load().then(resolve, reject);
          },
          Math.max(0, cached.expires - now()),
        );
        pending.then(
          (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          (error) => {
            clearTimeout(timer);
            reject(error);
          },
        );
      });
    }
    entries.delete(key);
    while (entries.size >= maximumEntries) {
      const oldest = entries.keys().next().value;
      if (oldest === undefined) break;
      entries.delete(oldest);
    }
    // Workers may cancel timers/I/O when the initiating HTTP request ends.
    // A stale pending request must never poison this key indefinitely.
    const entry: Entry = { expires: now() + pendingLifetimeMs };
    entries.set(key, entry);
    entry.request = Promise.resolve()
      .then(load)
      .then(
        (value) => {
          if (entries.get(key) === entry) {
            entry.value = value;
            entry.expires = now() + ttlMs;
            entry.request = undefined;
          }
          return value;
        },
        (error) => {
          if (entries.get(key) === entry) entries.delete(key);
          throw error;
        },
      );
    return entry.request;
  };
}
