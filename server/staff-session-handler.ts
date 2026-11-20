import { z } from "zod";
import { abortable } from "@/lib/abortable";
import { staffSessionReceipt } from "@/lib/staff-session";
import { HttpError } from "./http";
const input = z
  .object({ action: z.enum(["status", "start", "touch", "end"]) })
  .strict();
type Action = z.infer<typeof input>["action"];
type Dependencies = {
  sameOrigin: (request: Request) => boolean;
  authenticate: (
    request: Request,
  ) => Promise<null | {
    run: (
      action: Action,
      signal: AbortSignal,
    ) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;
  }>;
};
const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Authorization",
  "X-Content-Type-Options": "nosniff",
};
const reply = (status: number, value: unknown) =>
  Response.json(value, { status, headers });

async function readInput(request: Request, signal: AbortSignal) {
  if (Number(request.headers.get("content-length")) > 1000)
    throw new HttpError(413, "Request too large");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "A JSON body is required");
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await abortable(reader.read(), signal);
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > 1000) {
        cancel();
        throw new HttpError(413, "Request too large");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of chunks) {
      bytes.set(part, offset);
      offset += part.byteLength;
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

/** Authentication, body read and the no-argument RPC share one 12-second deadline. */
export async function handleStaffSession(
  request: Request,
  deps: Dependencies,
  timeoutMs = 12000,
) {
  if (!deps.sameOrigin(request))
    return reply(403, { error: "Open admin access from CollegeStat." });
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 12000)
    return reply(503, { error: "Admin session checks are unavailable." });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const signal = AbortSignal.any([request.signal, controller.signal]);
  try {
    const auth = await abortable(deps.authenticate(request), signal);
    signal.throwIfAborted();
    if (!auth) throw new HttpError(401, "Sign in required");
    const parsed = input.safeParse(await readInput(request, signal));
    if (!parsed.success)
      throw new HttpError(400, "Invalid admin session request");
    signal.throwIfAborted();
    const result = await abortable(
      Promise.resolve(auth.run(parsed.data.action, signal)),
      signal,
    );
    if (result.error)
      throw new HttpError(
        result.error.code === "42501" ? 403 : 503,
        parsed.data.action === "start"
          ? "Verify a fresh authenticator code to open the admin panel."
          : "Your admin session ended. Verify your authenticator again.",
      );
    const receipt = staffSessionReceipt.safeParse(result.data);
    if (!receipt.success)
      throw new HttpError(
        503,
        "Admin session checks are unavailable. Please retry.",
      );
    signal.throwIfAborted();
    return reply(200, receipt.data);
  } catch (error) {
    return reply(error instanceof HttpError ? error.status : 503, {
      error:
        error instanceof HttpError
          ? error.message
          : "Admin session checks timed out or could not be verified. Please retry.",
    });
  } finally {
    clearTimeout(timer);
  }
}
