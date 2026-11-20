import { abortable } from "@/lib/abortable";
import type { AccountScope, AccountToken } from "@/lib/account-owner";
import {
  supportInput,
  supportReceipt,
  type SupportInput,
} from "@/lib/support-requests";

export async function sendSupport(
  scope: AccountScope,
  captured: AccountToken,
  draft: SupportInput,
  deps: {
    session: () => Promise<{ owner: string; token: string } | null>;
    fetch: typeof fetch;
    timeoutMs?: number;
  },
  signal?: AbortSignal,
) {
  const token = { ...captured };
  // Extract the browser native function; calling it as a dependency method gives
  // it the wrong receiver and throws an Illegal invocation in Chromium.
  const dispatch = deps.fetch;
  const input = supportInput.parse(draft);
  const controller = new AbortController();
  const current = () => {
    if (!scope.isCurrent(token))
      throw new Error("Your account changed. Reopen the form before sending.");
    controller.signal.throwIfAborted();
  };
  const cancel = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", cancel, { once: true });
  if (signal?.aborted) cancel();
  const unsubscribe = scope.subscribe(() => {
    if (!scope.isCurrent(token))
      controller.abort(
        new Error("Your account changed. Your message was not confirmed."),
      );
  });
  const timer = setTimeout(
    () =>
      controller.abort(
        new Error("The message took too long. Your draft is kept."),
      ),
    Math.min(15000, deps.timeoutMs || 15000),
  );
  try {
    current();
    const session = token.owner
      ? await abortable(deps.session(), controller.signal)
      : null;
    current();
    if (token.owner && (!session?.token || session.owner !== token.owner))
      throw new Error("Sign in again before sending.");
    const response = await abortable(
      dispatch("/api/support", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session ? { Authorization: "Bearer " + session.token } : {}),
        },
        body: JSON.stringify(input),
        signal: controller.signal,
      }),
      controller.signal,
    );
    current();
    const result: unknown = await abortable(response.json(), controller.signal);
    current();
    if (!response.ok)
      throw new Error(
        typeof result === "object" &&
          result !== null &&
          "error" in result &&
          typeof result.error === "string"
          ? result.error.slice(0, 250)
          : "Your message could not be confirmed. Your draft is kept.",
      );
    const receipt = supportReceipt.parse(
      typeof result === "object" && result !== null && "receipt" in result
        ? result.receipt
        : null,
    );
    if (receipt.id !== input.id)
      throw new Error("The message receipt did not match. Please retry.");
    return receipt;
  } finally {
    clearTimeout(timer);
    unsubscribe();
    signal?.removeEventListener("abort", cancel);
  }
}
