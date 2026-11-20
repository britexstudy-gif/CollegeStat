import { abortable } from "@/lib/abortable";
import { isUUID } from "@/lib/student-writing";

type Result = { error: unknown | null };
type DeletionDependencies = {
  sameOrigin: (request: Request) => boolean;
  authenticate: (
    request: Request,
  ) => Promise<{ user: { id: string }; token: string } | null>;
  service: (signal: AbortSignal) => {
    consumeLimit: (owner: string) => PromiseLike<Result & { data: unknown }>;
    revokeSessions: (token: string) => Promise<Result>;
    deleteUser: (owner: string) => Promise<Result>;
  } | null;
  failure: (error: unknown) => Response;
  timeoutMs?: number;
};

/** No target ID or role is accepted from the body: only the verified bearer owner. */
export function createAccountDeletionHandler(deps: DeletionDependencies) {
  return async (request: Request) => {
    const respond = (body: unknown, status = 200, extra?: HeadersInit) => {
      const headers = new Headers(extra);
      headers.set("Cache-Control", "private, no-store");
      return Response.json(body, { status, headers });
    };
    if (request.method !== "DELETE")
      return respond({ error: "Method not allowed" }, 405, { Allow: "DELETE" });
    if (!deps.sameOrigin(request))
      return respond({ error: "Request origin could not be confirmed" }, 403);
    const bearer = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/)?.[1];
    if (!bearer) return respond({ error: "Sign in required" }, 401);
    const controller = new AbortController();
    const cancel = () => controller.abort(request.signal.reason);
    request.signal.addEventListener("abort", cancel, { once: true });
    if (request.signal.aborted) cancel();
    const timeoutMs = Math.min(
      12000,
      Number.isFinite(deps.timeoutMs) && (deps.timeoutMs ?? 0) > 0
        ? deps.timeoutMs!
        : 12000,
    );
    const timeout = setTimeout(
      () => controller.abort(new Error("Account deletion deadline exceeded")),
      timeoutMs,
    );
    const bounded = <T>(operation: PromiseLike<T>) =>
      abortable(Promise.resolve(operation), controller.signal);
    let revoked = false;
    try {
      controller.signal.throwIfAborted();
      const auth = await bounded(deps.authenticate(request));
      controller.signal.throwIfAborted();
      if (!auth || !isUUID(auth.user?.id) || auth.token !== bearer)
        return respond({ error: "Sign in required" }, 401);
      // Copy both primitives before any later await. An auth object or refreshed
      // client session must never change the deletion target or revocation token.
      const owner = auth.user.id;
      const token = auth.token;
      const service = deps.service(controller.signal);
      if (!service)
        return respond({ error: "Account management is not configured" }, 503);
      const limit = await bounded(service.consumeLimit(owner));
      controller.signal.throwIfAborted();
      if (
        !limit ||
        limit.error !== null ||
        (limit.data !== true && limit.data !== false)
      )
        return respond(
          { error: "Account management is temporarily unavailable" },
          503,
        );
      if (limit.data === false)
        return respond(
          { error: "Please wait before retrying account deletion" },
          429,
          {
            "Retry-After": "3600",
          },
        );
      const signOut = await bounded(service.revokeSessions(token));
      controller.signal.throwIfAborted();
      if (!signOut || signOut.error !== null)
        throw (
          signOut?.error ||
          new Error("Session revocation could not be confirmed")
        );
      revoked = true;
      // Revocation terminates refresh sessions; it cannot invalidate an already
      // issued JWT. Deletion still requires the exact authenticated user's ID.
      const deletion = await bounded(service.deleteUser(owner));
      controller.signal.throwIfAborted();
      if (!deletion || deletion.error !== null)
        throw (
          deletion?.error ||
          new Error("Account deletion could not be confirmed")
        );
      return respond({ deleted: true });
    } catch (error) {
      if (controller.signal.aborted)
        return respond(
          {
            error:
              "Account deletion could not be confirmed. Sign in again to check your account.",
          },
          503,
        );
      const response = deps.failure(error);
      if (revoked)
        return respond(
          {
            error:
              "Your account could not be deleted. Sign in again before retrying.",
          },
          response.status,
        );
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    } finally {
      clearTimeout(timeout);
      request.signal.removeEventListener("abort", cancel);
    }
  };
}
