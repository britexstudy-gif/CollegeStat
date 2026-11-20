import { abortable } from "@/lib/abortable";
import {
  supportInput,
  supportReceipt,
  type SupportInput,
} from "@/lib/support-requests";
import { HttpError, readJSON } from "./http";

type Dependencies = {
  sameOrigin: (request: Request) => boolean;
  send: (
    input: SupportInput,
    request: Request,
    signal: AbortSignal,
  ) => Promise<unknown>;
};
const reply = (status: number, value: unknown) =>
  Response.json(value, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function handleSupport(request: Request, deps: Dependencies) {
  if (!deps.sameOrigin(request))
    return reply(403, { error: "Send your message from CollegeStat." });
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(15000)]);
  try {
    const input = supportInput.safeParse(
      await abortable(readJSON(request, 24000, signal), signal),
    );
    if (!input.success)
      return reply(400, {
        error:
          "Add a subject, a message of 20–5,000 characters and permission to review it.",
      });
    const result = await abortable(
      deps.send(input.data, request, signal),
      signal,
    );
    if (
      typeof result === "object" &&
      result !== null &&
      "error_code" in result
    ) {
      const code = (result as { error_code: unknown }).error_code;
      return reply(code === "limit" ? 429 : 409, {
        error:
          code === "limit"
            ? "The message limit was reached. Keep your draft and try again later."
            : "This message changed after sending. Start a new message to send another draft.",
      });
    }
    const receipt = supportReceipt.parse(result);
    if (receipt.id !== input.data.id)
      throw new Error("Mismatched support receipt");
    return reply(201, { receipt });
  } catch (error) {
    if (error instanceof HttpError)
      return reply(error.status, { error: error.message });
    return reply(503, {
      error:
        "Your message could not be confirmed. Your draft is kept; please retry.",
    });
  }
}
