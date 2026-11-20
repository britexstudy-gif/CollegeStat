import type { AccountScope, AccountToken } from "@/lib/account-owner";
import { abortable } from "@/lib/abortable";
import { getSupabase } from "@/lib/supabase/client";
import { isUUID } from "@/lib/student-writing";

export class ProfileAccountChangedError extends Error {
  constructor() {
    super("Your account changed. Open your current profile and retry.");
    this.name = "ProfileAccountChangedError";
  }
}

type ProfileUpdate = {
  display_name: string | null;
  preferences: Record<string, unknown>;
};
type ProfileDependencies = {
  url: string;
  key: string;
  session: () => Promise<{ owner: string; token: string } | null>;
  fetch: typeof fetch;
  timeoutMs?: number;
};

const deletionRecoveryMessages = new Set([
  "Your account could not be deleted. Sign in again before retrying.",
  "Account deletion could not be confirmed. Sign in again to check your account.",
  "Please wait before retrying account deletion",
  "Sign in required",
  "Account management is not configured",
  "Account management is temporarily unavailable",
  "Request origin could not be confirmed",
]);
function deletionFailureMessage(result: unknown) {
  if (
    result &&
    typeof result === "object" &&
    "error" in result &&
    typeof result.error === "string" &&
    deletionRecoveryMessages.has(result.error)
  )
    return result.error;
  return "Account deletion could not be completed. Sign in again before retrying.";
}

function profileBody(input: ProfileUpdate) {
  if (
    !input ||
    (input.display_name !== null &&
      (typeof input.display_name !== "string" ||
        input.display_name.length > 120)) ||
    !input.preferences ||
    typeof input.preferences !== "object" ||
    Array.isArray(input.preferences)
  )
    throw new Error(
      "Choose a name of up to 120 characters and valid priorities.",
    );
  // Only editable columns enter the request, even if an untyped caller passes
  // role, id or timestamps. The database column grants remain authoritative.
  const body = JSON.stringify({
    display_name: input.display_name,
    preferences: input.preferences,
  });
  const parsed: unknown = JSON.parse(body);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("preferences" in parsed) ||
    !parsed.preferences ||
    typeof parsed.preferences !== "object" ||
    Array.isArray(parsed.preferences) ||
    new TextEncoder().encode(body).length > 32768
  )
    throw new Error("Your priorities are too large or could not be read.");
  return body;
}

/** Each mutation uses only its initiating owner's frozen session token. */
export function createProfileAccountService(deps: ProfileDependencies) {
  const dispatch = deps.fetch;

  async function mutate(
    scope: AccountScope,
    captured: AccountToken,
    operation: "save" | "history" | "preferences" | "delete",
    body?: string,
  ) {
    const initiating = { ...captured };
    const controller = new AbortController();
    const current = () => {
      if (!isUUID(initiating.owner) || !scope.isCurrent(initiating))
        controller.abort(new ProfileAccountChangedError());
      controller.signal.throwIfAborted();
    };
    const timeout = setTimeout(
      () => controller.abort(new Error("Your account request timed out.")),
      Math.min(
        15000,
        Number.isFinite(deps.timeoutMs) && (deps.timeoutMs ?? 0) > 0
          ? deps.timeoutMs!
          : 15000,
      ),
    );
    const unsubscribe = scope.subscribe(() => {
      if (!scope.isCurrent(initiating))
        controller.abort(new ProfileAccountChangedError());
    });
    try {
      current();
      const session = await abortable(deps.session(), controller.signal);
      current();
      if (!session?.token || session.owner !== initiating.owner)
        throw new ProfileAccountChangedError();
      const deletion = operation === "delete";
      const history = operation === "history";
      const url = deletion
        ? "/api/account"
        : new URL(
            history ? "/rest/v1/research_history" : "/rest/v1/profiles",
            deps.url,
          );
      if (url instanceof URL) {
        url.searchParams.set(
          history ? "user_id" : "id",
          "eq." + initiating.owner,
        );
        if (!history) url.searchParams.set("select", "id");
      }
      const headers: Record<string, string> = {
        Authorization: "Bearer " + session.token,
        "Content-Type": "application/json",
      };
      if (!deletion) {
        headers.apikey = deps.key;
        headers.Prefer = history ? "return=minimal" : "return=representation";
      }
      current();
      const response = await abortable(
        dispatch(url, {
          method: deletion || history ? "DELETE" : "PATCH",
          headers,
          body,
          signal: controller.signal,
        }),
        controller.signal,
      );
      current();
      if (!response.ok) {
        if (deletion) {
          let result: unknown;
          try {
            result = await abortable(response.json(), controller.signal);
          } catch {
            // An unreadable error body cannot erase cancellation or owner
            // changes. Never display arbitrary returned internals to students.
            current();
          }
          current();
          throw new Error(deletionFailureMessage(result));
        }
        throw new Error("Your account request could not be completed.");
      }
      if (!history) {
        const result: unknown = await abortable(
          response.json(),
          controller.signal,
        );
        current();
        const confirmed = deletion
          ? result !== null &&
            typeof result === "object" &&
            "deleted" in result &&
            result.deleted === true
          : Array.isArray(result) &&
            result.length === 1 &&
            result[0]?.id === initiating.owner;
        if (!confirmed)
          throw new Error("Your account change could not be confirmed.");
      }
      current();
    } catch (error) {
      current();
      throw error;
    } finally {
      clearTimeout(timeout);
      unsubscribe();
    }
  }

  return {
    save(scope: AccountScope, input: ProfileUpdate, token = scope.capture()) {
      // Serialize before the session await; later edits cannot alter this save.
      return mutate(scope, token, "save", profileBody(input));
    },
    clear(scope: AccountScope, history: boolean, token = scope.capture()) {
      return mutate(
        scope,
        token,
        history ? "history" : "preferences",
        history ? undefined : JSON.stringify({ preferences: {} }),
      );
    },
    remove(scope: AccountScope, token = scope.capture()) {
      // Never call the shared auth.signOut after this awaited request: it could
      // consume or clear a replacement session. The UI confirms deletion instead.
      return mutate(scope, token, "delete");
    },
  };
}

function connectedService() {
  const db = getSupabase();
  if (!db) throw new Error("Sign in to manage your profile.");
  return createProfileAccountService({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    key:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
    session: async () => {
      const { data, error } = await db.auth.getSession();
      return !error && data.session
        ? { owner: data.session.user.id, token: data.session.access_token }
        : null;
    },
    fetch,
  });
}

export const saveProfile = (
  scope: AccountScope,
  input: ProfileUpdate,
  token: AccountToken,
) => connectedService().save(scope, input, token);
export const clearProfile = (
  scope: AccountScope,
  history: boolean,
  token: AccountToken,
) => connectedService().clear(scope, history, token);
export const deleteProfileAccount = (
  scope: AccountScope,
  token: AccountToken,
) => connectedService().remove(scope, token);
