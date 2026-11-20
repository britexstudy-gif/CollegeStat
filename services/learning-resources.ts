import { abortable } from "@/lib/abortable";
import { latestResources, learningResources } from "@/lib/learning-resources";
import { reviewedLearningResources } from "@/lib/resource-library-state";

export function createLearningResourceRefresh(deps: {
  fetch: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
}) {
  const dispatch = deps.fetch;
  return async (signal?: AbortSignal) => {
    const controller = new AbortController();
    const cancel = () =>
      controller.abort(
        signal?.reason || new DOMException("Cancelled", "AbortError"),
      );
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    const timeout = setTimeout(
      () =>
        controller.abort(
          new Error("The resource refresh took too long. Please retry."),
        ),
      Math.min(
        10000,
        deps.timeoutMs && deps.timeoutMs > 0 ? deps.timeoutMs : 10000,
      ),
    );
    const maximum = Math.min(
      512 * 1024,
      deps.maxBytes && deps.maxBytes > 0 ? deps.maxBytes : 512 * 1024,
    );
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      controller.signal.throwIfAborted();
      const response = await abortable(
        dispatch("/api/learning-resources", { signal: controller.signal }),
        controller.signal,
      );
      if (!response.ok)
        throw new Error(
          "The resource catalogue could not refresh. Please retry.",
        );
      const contentLength = response.headers.get("content-length");
      if (
        contentLength &&
        (!/^\d+$/.test(contentLength) || Number(contentLength) > maximum)
      )
        throw new Error("The resource update was too large to verify.");
      if (!response.body) throw new Error("The resource update was empty.");
      reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let bytes = 0,
        body = "";
      for (;;) {
        const chunk = await abortable(reader.read(), controller.signal);
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > maximum)
          throw new Error("The resource update was too large to verify.");
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
      controller.signal.throwIfAborted();
      let value: unknown;
      try {
        value = JSON.parse(body);
      } catch {
        throw new Error("The resource update could not be read. Please retry.");
      }
      // A partial/newer hosted set cannot erase installed reviewed guidance or
      // replace it with an older version of the same source.
      return latestResources([
        ...learningResources,
        ...reviewedLearningResources(value),
      ]);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
      // Cancelling a bad/stalled response must not itself hold the UI open.
      void reader?.cancel().catch(() => {});
      controller.abort();
    }
  };
}
export const refreshLearningResources = createLearningResourceRefresh({
  fetch: (...args) => fetch(...args),
});
