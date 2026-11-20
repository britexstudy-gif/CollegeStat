import { getSupabase } from "@/lib/supabase/client";
import { MCP_VERSION, type AdminTool } from "@/lib/admin-mcp";
import {
  AccountScope,
  type AccountOwner,
  type AccountToken,
} from "@/lib/account-owner";
import { z } from "zod";
import {
  StaffSessionScope,
  StaffSessionExpiredError,
  staffTokenSessionId,
} from "@/lib/staff-session";

export type StaffRequestOptions = {
  scope: AccountScope;
  token?: AccountToken;
  timeoutMs?: number;
  staffSession?: StaffSessionScope;
  observeSession?: (token: string) => void;
  expectedSessionId?: string;
};

type StaffSessionResult = {
  data: { session: { access_token: string; user: { id: string } } | null };
  error?: unknown;
};

export type StaffRequestDependencies = {
  getSession: () => Promise<StaffSessionResult>;
  fetch: typeof fetch;
  subscribeAccountChanges?: (
    listener: (owner: AccountOwner) => void,
  ) => () => void;
};

export class StaffAccountChangedError extends Error {
  constructor() {
    super("Your staff account changed. Retry from the current account.");
    this.name = "StaffAccountChangedError";
  }
}

function abortable<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener("abort", aborted, { once: true });
    operation.then(
      (result) => {
        signal.removeEventListener("abort", aborted);
        resolve(result);
      },
      (error) => {
        signal.removeEventListener("abort", aborted);
        reject(error);
      },
    );
    if (signal.aborted) aborted();
  });
}

/** Bind work before the first await; a replacement account never inherits it. */
export function createStaffFetch(dependencies: StaffRequestDependencies) {
  return async function fetchForAccount<T = unknown>(
    path: string,
    body: unknown,
    signal?: AbortSignal,
    options?: StaffRequestOptions,
  ): Promise<T> {
    // Existing call signatures remain valid, but a caller without account
    // context must fail before sending even a read or staging request.
    if (!options?.scope) throw new Error("Staff account context is required");
    const { scope } = options;
    const staffSession = options.staffSession;
    const staffGeneration = staffSession?.capture();
    const initiating = { ...(options.token ?? scope.capture()) };
    if (!initiating.owner) throw new Error("Sign in required");
    const duration = options.timeoutMs ?? 15000;
    if (!Number.isFinite(duration) || duration <= 0)
      throw new Error("Invalid staff request timeout");

    const controller = new AbortController();
    const assertCurrent = () => {
      if (!scope.isCurrent(initiating))
        controller.abort(new StaffAccountChangedError());
      if (staffSession && staffGeneration !== undefined) {
        try {
          staffSession.assertCurrent(staffGeneration);
        } catch {
          controller.abort(new StaffSessionExpiredError());
        }
      }
      controller.signal.throwIfAborted();
    };
    const cancel = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    const timer = setTimeout(
      () =>
        controller.abort(new Error("Staff request timed out. Please retry.")),
      Math.min(duration, 60000),
    );
    let unsubscribe: (() => void) | undefined;
    let unsubscribeStaff: (() => void) | undefined;
    try {
      assertCurrent();
      unsubscribeStaff = staffSession?.subscribe(() => {
        try {
          assertCurrent();
        } catch {
          /* The request's await reports the abort. */
        }
      });
      unsubscribe = dependencies.subscribeAccountChanges?.((owner) => {
        if (owner !== initiating.owner || !scope.isCurrent(initiating))
          controller.abort(new StaffAccountChangedError());
      });
      // Capture the draft with its initiating owner rather than reading a
      // mutable draft again after an asynchronous session lookup.
      const serializedBody = JSON.stringify(body);
      assertCurrent();
      const session = await abortable(
        dependencies.getSession(),
        controller.signal,
      );
      assertCurrent();
      if (session.error)
        throw new Error("Staff session could not be checked. Please retry.");
      const authenticated = session.data.session;
      if (!authenticated?.access_token) throw new Error("Sign in required");
      if (authenticated.user.id !== initiating.owner) {
        controller.abort(new StaffAccountChangedError());
        assertCurrent();
      }
      options.observeSession?.(authenticated.access_token);
      if (
        options.expectedSessionId &&
        staffTokenSessionId(authenticated.access_token) !==
          options.expectedSessionId
      )
        controller.abort(new StaffSessionExpiredError());
      if (
        staffSession &&
        !staffSession.matchesToken(authenticated.access_token)
      )
        controller.abort(new StaffSessionExpiredError());
      assertCurrent();
      const response = await abortable(
        dependencies.fetch(path, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            "MCP-Protocol-Version": MCP_VERSION,
            Authorization: "Bearer " + authenticated.access_token,
          },
          body: serializedBody,
        }),
        controller.signal,
      );
      assertCurrent();
      if (response.status === 202) return undefined as T;
      const result: unknown = await abortable(
        response.json(),
        controller.signal,
      );
      assertCurrent();
      if (!response.ok) {
        const error = z.object({ error: z.string() }).safeParse(result);
        throw new Error(
          error.success ? error.data.error : "Staff request failed",
        );
      }
      return result as T;
    } catch (error) {
      assertCurrent();
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      unsubscribe?.();
      unsubscribeStaff?.();
    }
  };
}

export async function staffFetch<T = unknown>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
  options?: StaffRequestOptions,
): Promise<T> {
  if (!options?.scope) throw new Error("Staff account context is required");
  const db = getSupabase();
  if (!db) throw new Error("Sign in required");
  return createStaffFetch({
    getSession: () => db.auth.getSession(),
    fetch: (input, init) => fetch(input, init),
    subscribeAccountChanges: (listener) => {
      const { data } = db.auth.onAuthStateChange((_event, session) => {
        listener(session?.user.id ?? null);
      });
      return () => data.subscription.unsubscribe();
    },
  })(path, body, signal, options);
}
export async function callStaffTool<T = unknown>(
  name: AdminTool,
  args: Record<string, unknown>,
  signal?: AbortSignal,
  options?: StaffRequestOptions,
): Promise<T> {
  const response = z
    .object({
      error: z.object({ message: z.string() }).optional(),
      result: z
        .object({
          isError: z.boolean(),
          content: z.array(z.object({ text: z.string() })),
          structuredContent: z.object({ data: z.unknown() }).optional(),
        })
        .optional(),
    })
    .parse(
      await staffFetch(
        "/api/staff/mcp",
        {
          jsonrpc: "2.0",
          id: crypto.randomUUID(),
          method: "tools/call",
          params: { name, arguments: args },
        },
        signal,
        options,
      ),
    );
  if (response.error) throw new Error(response.error.message);
  if (!response.result) throw new Error("Invalid MCP response");
  if (response.result.isError)
    throw new Error(response.result.content[0]?.text || "Tool failed");
  return response.result.structuredContent?.data as T;
}
