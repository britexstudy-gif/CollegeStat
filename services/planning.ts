import type { AccountScope } from "@/lib/account-owner";
import { abortable } from "@/lib/abortable";
import { getSupabase } from "@/lib/supabase/client";

export class PlanningAccountChangedError extends Error {
  constructor() {
    super("Your account changed. Open your current plan and retry.");
    this.name = "PlanningAccountChangedError";
  }
}
type PlanTask = { title: string; done: boolean };
type PlanningDeps = {
  url: string;
  key: string;
  session: () => Promise<{ owner: string; token: string } | null>;
  fetch: typeof fetch;
  timeoutMs?: number;
};
export function createSavePlanningTasks(deps: PlanningDeps) {
  // Native browser fetch must be called without the dependency object as `this`.
  const dispatch = deps.fetch;
  return async (scope: AccountScope, tasks: PlanTask[]) => {
    const captured = scope.capture();
    const controller = new AbortController();
    const current = () => {
      if (!captured.owner || !scope.isCurrent(captured))
        controller.abort(new PlanningAccountChangedError());
      controller.signal.throwIfAborted();
    };
    current();
    if (
      !Array.isArray(tasks) ||
      !tasks.length ||
      tasks.length > 100 ||
      tasks.some(
        (task) =>
          !task ||
          typeof task.title !== "string" ||
          typeof task.done !== "boolean",
      )
    )
      throw new Error(
        "Choose 1–20 valid planning steps, each no longer than 300 characters.",
      );
    const selected = [
      ...new Map(
        tasks.map((t) => [
          t.title.trim(),
          { title: t.title.trim(), done: t.done },
        ]),
      ).values(),
    ];
    if (
      !selected.length ||
      selected.length > 20 ||
      selected.some((t) => !t.title || t.title.length > 300)
    )
      throw new Error(
        "Choose 1–20 valid planning steps, each no longer than 300 characters.",
      );
    const timeoutMs = Math.min(
      15000,
      Number.isFinite(deps.timeoutMs) && (deps.timeoutMs ?? 0) > 0
        ? deps.timeoutMs!
        : 15000,
    );
    const timeout = setTimeout(
      () =>
        controller.abort(
          new Error("Saving your plan timed out. Please retry."),
        ),
      timeoutMs,
    );
    const unsubscribe = scope.subscribe(() => {
      if (!scope.isCurrent(captured))
        controller.abort(new PlanningAccountChangedError());
    });
    try {
      const session = await abortable(deps.session(), controller.signal);
      current();
      if (!session?.token || session.owner !== captured.owner)
        throw new PlanningAccountChangedError();
      // Freeze the authenticated owner for both requests; a token refresh/account switch
      // must never send this student's draft using another account's credentials.
      const headers = {
        apikey: deps.key,
        Authorization: `Bearer ${session.token}`,
        "Content-Type": "application/json",
      };
      const url = new URL("/rest/v1/user_checklist", deps.url);
      url.searchParams.set("select", "title");
      url.searchParams.set("user_id", "eq." + captured.owner);
      url.searchParams.set(
        "title",
        "in.(" +
          selected
            .map(
              (t) =>
                '"' +
                t.title.replaceAll("\\", "\\\\").replaceAll('"', '\\"') +
                '"',
            )
            .join(",") +
          ")",
      );
      url.searchParams.set("limit", "20");
      const response = await abortable(
        dispatch(url, {
          headers: { ...headers, Prefer: "count=exact" },
          signal: controller.signal,
        }),
        controller.signal,
      );
      current();
      if (!response.ok)
        throw new Error("Your plan could not be loaded. Please retry.");
      const existing: unknown = await abortable(
        response.json(),
        controller.signal,
      );
      current();
      const selectedTitles = new Set(selected.map((task) => task.title));
      if (
        !Array.isArray(existing) ||
        existing.length > 20 ||
        existing.some(
          (row) =>
            !row ||
            typeof row.title !== "string" ||
            !selectedTitles.has(row.title),
        )
      )
        throw new Error(
          "Your existing steps could not be confirmed. Please retry.",
        );
      const contentRange = response.headers?.get("content-range");
      if (contentRange) {
        const count = contentRange.match(/^(?:(\d+)-(\d+)|\*)\/(\d+)$/);
        // A server row cap must not hide a matching saved title and create
        // duplicate steps. Require the complete filtered receipt when known.
        if (
          !count ||
          Number(count[3]) !== existing.length ||
          (existing.length > 0 &&
            (Number(count[1]) !== 0 ||
              Number(count[2]) !== existing.length - 1))
        )
          throw new Error(
            "Your existing steps could not be confirmed. Please retry.",
          );
      }
      const titles = new Set(existing.map((r: { title: string }) => r.title));
      const missing = selected.filter((t) => !titles.has(t.title));
      if (!missing.length) return 0;
      const result = await abortable(
        dispatch(new URL("/rest/v1/user_checklist", deps.url), {
          method: "POST",
          headers: { ...headers, Prefer: "return=minimal" },
          body: JSON.stringify(
            missing.map((t) => ({ ...t, user_id: captured.owner })),
          ),
          signal: controller.signal,
        }),
        controller.signal,
      );
      current();
      if (!result.ok)
        throw new Error("Your steps could not be saved. Please retry.");
      return missing.length;
    } catch (error) {
      current();
      throw error;
    } finally {
      clearTimeout(timeout);
      unsubscribe();
    }
  };
}
export async function savePlanningTasks(
  scope: AccountScope,
  tasks: PlanTask[],
) {
  const db = getSupabase();
  if (!db) throw new Error("Sign in to save your plan.");
  return createSavePlanningTasks({
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
  })(scope, tasks);
}
