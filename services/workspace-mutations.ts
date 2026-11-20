import { z } from "zod";
import type { AccountScope, AccountToken } from "@/lib/account-owner";
import { abortable } from "@/lib/abortable";
import { isUUID } from "@/lib/student-writing";
import { validPlanDate } from "@/lib/workspace-planner";
import { getSupabase } from "@/lib/supabase/client";

const uuid = z.string().uuid();
const date = z
  .string()
  .refine(validPlanDate, "Choose a real calendar date")
  .nullable();
const schemas = {
  user_checklist: z
    .object({
      id: uuid.optional(),
      title: z.string().trim().min(1).max(300),
      due_at: date.optional(),
      done: z.boolean().optional(),
      university_id: uuid.nullable().optional(),
    })
    .strict(),
  user_lists: z
    .object({ id: uuid.optional(), name: z.string().trim().min(1).max(100) })
    .strict(),
  user_notes: z
    .object({ university_id: uuid, body: z.string().max(10000) })
    .strict(),
  user_list_items: z
    .object({
      list_id: uuid,
      university_id: uuid,
      position: z.number().int().min(0).max(2147483647),
    })
    .strict(),
  saved_universities: z
    .object({
      university_id: uuid,
      status: z
        .enum([
          "Researching",
          "Considering",
          "Applying",
          "Submitted",
          "Accepted",
          "Rejected",
          "Waitlisted",
        ])
        .optional(),
      deadline: date.optional(),
    })
    .strict()
    .refine((row) => row.status !== undefined || row.deadline !== undefined),
};
type WriteTable = keyof typeof schemas;
const conflicts: Partial<Record<WriteTable, string[]>> = {
  user_notes: ["user_id", "university_id"],
  user_list_items: ["list_id", "university_id"],
  saved_universities: ["user_id", "university_id"],
};
const removable = new Set([
  "comparison_lists",
  "saved_searches",
  "user_checklist",
  "user_list_items",
  "user_lists",
]);
const taskPatch = z
  .object({
    done: z.boolean().optional(),
    due_at: date.optional(),
    title: z.string().trim().min(1).max(300).optional(),
  })
  .strict()
  .refine(
    (row) =>
      row.done !== undefined || row.due_at !== undefined || row.title !== undefined,
  );
type Dependencies = {
  url: string;
  key: string;
  fetch: typeof fetch;
  session: () => Promise<{ owner: string; token: string } | null>;
  randomId?: () => string;
  timeoutMs?: number;
};
export class WorkspaceAccountChangedError extends Error {
  constructor() {
    super("Your account changed. Open your current workspace and retry.");
    this.name = "WorkspaceAccountChangedError";
  }
}
class WorkspaceConflictError extends Error {
  constructor() {
    super("Your workspace change could not be saved. Please retry.");
  }
}

/** Frozen owner, generation and credentials for every stage of one mutation. */
export function createWorkspaceMutationService(deps: Dependencies) {
  const dispatch = deps.fetch;
  const newId = deps.randomId ?? (() => crypto.randomUUID());
  async function run<T>(
    scope: AccountScope,
    token: AccountToken,
    action: (
      request: (
        table: string,
        filters: Record<string, string>,
        init?: RequestInit,
      ) => Promise<Record<string, unknown>[]>,
    ) => Promise<T>,
  ) {
    const initiating = { ...token };
    const controller = new AbortController();
    const current = () => {
      if (!isUUID(initiating.owner) || !scope.isCurrent(initiating))
        controller.abort(new WorkspaceAccountChangedError());
      controller.signal.throwIfAborted();
    };
    const timeout = setTimeout(
      () =>
        controller.abort(
          new Error("Your workspace change timed out. Please retry."),
        ),
      Math.min(
        15000,
        Number.isFinite(deps.timeoutMs) && (deps.timeoutMs ?? 0) > 0
          ? deps.timeoutMs!
          : 15000,
      ),
    );
    const unsubscribe = scope.subscribe(() => {
      if (!scope.isCurrent(initiating))
        controller.abort(new WorkspaceAccountChangedError());
    });
    try {
      current();
      const session = await abortable(deps.session(), controller.signal);
      current();
      if (!session?.token || session.owner !== initiating.owner)
        throw new WorkspaceAccountChangedError();
      const headers = {
        apikey: deps.key,
        Authorization: "Bearer " + session.token,
        "Content-Type": "application/json",
      };
      const request = async (
        table: string,
        filters: Record<string, string>,
        init?: RequestInit,
      ) => {
        current();
        const url = new URL("/rest/v1/" + table, deps.url);
        for (const [key, value] of Object.entries(filters))
          url.searchParams.set(key, value);
        // POST binds ownership in its frozen body; reads, updates and deletes
        // also carry an exact filter. PostgREST insert requests have no WHERE.
        if (init?.method !== "POST")
          url.searchParams.set("user_id", "eq." + initiating.owner);
        const response = await abortable(
          dispatch(url, {
            ...init,
            headers: {
              ...headers,
              ...Object.fromEntries(new Headers(init?.headers)),
            },
            signal: controller.signal,
          }),
          controller.signal,
        );
        current();
        if (response.status === 409) throw new WorkspaceConflictError();
        if (!response.ok)
          throw new Error(
            "Your workspace change could not be saved. Please retry.",
          );
        const rows: unknown = await abortable(
          response.json(),
          controller.signal,
        );
        current();
        if (
          !Array.isArray(rows) ||
          rows.length > 1 ||
          rows.some(
            (row) =>
              !row ||
              typeof row !== "object" ||
              !isUUID(row.id) ||
              row.user_id !== initiating.owner,
          )
        )
          throw new Error(
            "Your workspace change could not be confirmed. Please retry.",
          );
        return rows as Record<string, unknown>[];
      };
      const result = await action(request);
      current();
      return result;
    } catch (error) {
      current();
      throw error;
    } finally {
      clearTimeout(timeout);
      unsubscribe();
    }
  }
  const confirmed = (
    rows: Record<string, unknown>[],
    expected: Record<string, unknown>,
  ) => {
    if (
      rows.length !== 1 ||
      Object.entries(expected).some(([key, value]) => rows[0][key] !== value)
    )
      throw new Error(
        "Your workspace change could not be confirmed. Please retry.",
      );
    return rows[0].id as string;
  };
  return {
    write(
      scope: AccountScope,
      table: string,
      input: Record<string, unknown>,
      conflict?: string,
      token = scope.capture(),
    ) {
      if (!Object.hasOwn(schemas, table))
        throw new Error("This workspace collection cannot be edited here.");
      const kind = table as WriteTable;
      const payload: Record<string, unknown> = Object.fromEntries(
        Object.entries(schemas[kind].parse(input)).filter(
          ([, value]) => value !== undefined,
        ),
      );
      const unique = conflicts[kind];
      if (conflict !== undefined && conflict !== unique?.join(","))
        throw new Error("This workspace change has an invalid matching key.");
      const owner = token.owner;
      const id = unique ? null : String(payload.id ?? newId());
      if (id !== null && !isUUID(id))
        throw new Error("Choose a valid workspace item.");
      // Exact-ID inserts make a lost response safely retryable when the caller
      // retains payload.id. Existing rows are never replaced by an upsert.
      if (id !== null) payload.id = id;
      return run(scope, token, async (request) => {
        const readUnique = async () => {
          const filters: Record<string, string> = {
            select: "id,user_id," + Object.keys(payload).join(","),
            limit: "2",
          };
          for (const field of unique ?? [])
            if (field !== "user_id")
              filters[field] = "eq." + String(payload[field]);
          return request(table, filters);
        };
        if (unique) {
          const existing = await readUnique();
          if (existing.length) {
            for (const field of unique)
              if (field !== "user_id" && existing[0][field] !== payload[field])
                throw new Error(
                  "Your saved item could not be matched. Please retry.",
                );
            const rowId = existing[0].id as string;
            const updates = Object.fromEntries(
              Object.entries(payload).filter(([key]) => !unique.includes(key)),
            );
            // A status change cannot erase an omitted deadline, notes, row ID or
            // creation date. PATCH only the fields the user actually changed.
            return confirmed(
              await request(
                table,
                {
                  id: "eq." + rowId,
                  select: "id,user_id," + Object.keys(payload).join(","),
                },
                {
                  method: "PATCH",
                  headers: { Prefer: "return=representation" },
                  body: JSON.stringify(updates),
                },
              ),
              { id: rowId, ...payload },
            );
          }
        }
        const rowId = id ?? newId();
        if (!isUUID(rowId)) throw new Error("Choose a valid workspace item.");
        const expected = { ...payload, id: rowId };
        const fields =
          "id,user_id," +
          Object.keys(payload)
            .filter((key) => key !== "id")
            .join(",");
        let rows: Record<string, unknown>[];
        try {
          rows = await request(
            table,
            { on_conflict: "id", select: fields },
            {
              method: "POST",
              headers: {
                Prefer: "resolution=ignore-duplicates,return=representation",
              },
              body: JSON.stringify({ ...expected, user_id: owner }),
            },
          );
        } catch (error) {
          if (!(error instanceof WorkspaceConflictError) || !unique)
            throw error;
          // Another tab may have inserted this unique item after our GET.
          // Accept only an exact owned content match; never resolve the race
          // by overwriting the other tab's newer notes/status/deadline.
          return confirmed(await readUnique(), payload);
        }
        if (rows.length) return confirmed(rows, expected);
        // ignore-duplicates can return an empty representation; verify the
        // exact owner/ID/content instead of claiming an unconfirmed save.
        return confirmed(
          await request(table, {
            id: "eq." + rowId,
            select: fields,
            limit: "2",
          }),
          expected,
        );
      });
    },
    remove(
      scope: AccountScope,
      table: string,
      id: string,
      token = scope.capture(),
    ) {
      if (!removable.has(table) || !isUUID(id))
        throw new Error("Choose a valid workspace item to remove.");
      return run(scope, token, async (request) => {
        const rows = await request(
          table,
          { id: "eq." + id, select: "id,user_id" },
          {
            method: "DELETE",
            headers: { Prefer: "return=representation" },
          },
        );
        if (rows.length && rows[0].id !== id)
          throw new Error("The removed item could not be confirmed.");
        return rows.length;
      });
    },
    updateTask(
      scope: AccountScope,
      id: string,
      input: Record<string, unknown>,
      token = scope.capture(),
    ) {
      if (!isUUID(id)) throw new Error("Choose a valid task.");
      const payload = Object.fromEntries(
        Object.entries(taskPatch.parse(input)).filter(
          ([, value]) => value !== undefined,
        ),
      );
      return run(scope, token, async (request) =>
        confirmed(
          await request(
            "user_checklist",
            {
              id: "eq." + id,
              select: "id,user_id," + Object.keys(payload).join(","),
            },
            {
              method: "PATCH",
              headers: { Prefer: "return=representation" },
              body: JSON.stringify(payload),
            },
          ),
          { id, ...payload },
        ),
      );
    },
  };
}

function connectedService() {
  const db = getSupabase();
  if (!db) throw new Error("Sign in to manage your workspace.");
  return createWorkspaceMutationService({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    key:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
    fetch,
    session: async () => {
      const { data, error } = await db.auth.getSession();
      return !error && data.session
        ? { owner: data.session.user.id, token: data.session.access_token }
        : null;
    },
  });
}
export const writeWorkspace = (
  scope: AccountScope,
  table: string,
  payload: Record<string, unknown>,
  conflict?: string,
  token = scope.capture(),
) => connectedService().write(scope, table, payload, conflict, token);
export const removeWorkspace = (
  scope: AccountScope,
  table: string,
  id: string,
  token = scope.capture(),
) => connectedService().remove(scope, table, id, token);
export const updateWorkspaceTask = (
  scope: AccountScope,
  id: string,
  payload: Record<string, unknown>,
  token = scope.capture(),
) => connectedService().updateTask(scope, id, payload, token);
