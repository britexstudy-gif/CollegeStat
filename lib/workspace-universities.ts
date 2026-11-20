/** The public catalogue accepts small ID batches. Resolve the entire saved
 * collection without truncation, while keeping at most three reads in flight.
 * The caller publishes results only after the complete operation succeeds.
 */
export async function loadWorkspaceUniversities<T extends { id: string }>(
  ids: string[],
  read: (ids: string[], signal?: AbortSignal) => Promise<T[]>,
  {
    signal,
    isCurrent = () => true,
    timeoutMs = 30000,
  }: { signal?: AbortSignal; isCurrent?: () => boolean; timeoutMs?: number } = {},
): Promise<T[]> {
  const controller = new AbortController();
  const cancel = () => controller.abort(signal?.reason || new DOMException("Workspace loading was cancelled", "AbortError"));
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const timer = setTimeout(() => controller.abort(new Error("University details took too long to load. Your saved research is unchanged; please retry.")), Math.min(30000, Math.max(1, timeoutMs)));
  const selected = [...new Set(ids.filter(Boolean))];
  const batches: string[][] = [];
  for (let index = 0; index < selected.length; index += 24)
    batches.push(selected.slice(index, index + 24));
  const rows = new Map<string, T>();
  let cursor = 0;
  let failed = false;
  const guard = () => {
    if (!isCurrent()) controller.abort(new DOMException("Workspace loading was cancelled", "AbortError"));
    controller.signal.throwIfAborted();
  };
  const boundedRead = (batch: string[]) => new Promise<T[]>((resolve, reject) => {
    const aborted = () => reject(controller.signal.reason);
    controller.signal.addEventListener("abort", aborted, { once: true });
    Promise.resolve().then(() => { guard(); return read(batch, controller.signal); }).then(resolve, reject).finally(() => controller.signal.removeEventListener("abort", aborted));
    if (controller.signal.aborted) aborted();
  });
  const worker = async () => {
    while (cursor < batches.length && !failed) {
      guard();
      const batch = batches[cursor++];
      try {
        const result = await boundedRead(batch);
        guard();
        if (failed) return;
        for (const row of result)
          if (batch.includes(row.id)) rows.set(row.id, row);
      } catch (error) {
        failed = true;
        controller.abort(error);
        throw error;
      }
    }
  };
  try {
    guard();
    await Promise.all(Array.from({ length: Math.min(3, batches.length) }, worker));
    guard();
    return selected.flatMap((id) => (rows.has(id) ? [rows.get(id)!] : []));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}
