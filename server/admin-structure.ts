import { abortable } from "@/lib/abortable";
import { parseDatabaseStructure } from "@/lib/admin-structure";
import { HttpError } from "@/server/http";
import { z } from "zod";

export type StructureDependencies = {
  authorize: (request: Request) => Promise<{
    read: (
      signal: AbortSignal,
    ) => PromiseLike<{ data: unknown; error: unknown }>;
  }>;
};

const inputSchema = z.object({}).strict();
const headers = { "Cache-Control": "private, no-store", Vary: "Authorization" };

async function structureInput(
  request: Request,
  signal: AbortSignal,
): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > 1024)
    throw new HttpError(413, "Request too large");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "A JSON body is required");
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    signal.throwIfAborted();
    while (true) {
      const { done, value } = await abortable(reader.read(), signal);
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > 1024) {
        await reader.cancel();
        throw new HttpError(413, "Request too large");
      }
      parts.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new HttpError(400, "Invalid JSON");
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}

/** One deadline covers verification, request body and the authenticated RPC. */
export async function handleDatabaseStructure(
  request: Request,
  dependencies: StructureDependencies,
  timeoutMs = 15000,
): Promise<Response> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 15000)
    return Response.json(
      { error: "Database structure is unavailable." },
      { status: 503, headers },
    );
  const deadline = new AbortController();
  const timer = setTimeout(
    () => deadline.abort(new Error("Structure deadline exceeded")),
    timeoutMs,
  );
  const signal = AbortSignal.any([request.signal, deadline.signal]);
  try {
    signal.throwIfAborted();
    const auth = await abortable(dependencies.authorize(request), signal);
    const parsed = inputSchema.safeParse(await structureInput(request, signal));
    if (!parsed.success)
      throw new HttpError(
        400,
        "This preview accepts no table names, SQL or write commands.",
      );
    const result = await abortable(Promise.resolve(auth.read(signal)), signal);
    if (result.error)
      throw new HttpError(
        503,
        "Database structure could not load. Check its migration and your staff verification, then retry.",
      );
    const data = parseDatabaseStructure(result.data);
    signal.throwIfAborted();
    return Response.json(data, { headers });
  } catch (error) {
    if (error instanceof HttpError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers },
      );
    return Response.json(
      {
        error: signal.aborted
          ? "Database structure timed out. Please retry."
          : "Database structure could not be verified. Please retry.",
      },
      { status: 503, headers },
    );
  } finally {
    clearTimeout(timer);
  }
}
