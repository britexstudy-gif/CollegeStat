import { getSupabase } from "@/lib/supabase/client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountScope } from "@/lib/account-owner";
import { isUUID } from "@/lib/student-writing";
import { abortable } from "@/lib/abortable";
export type SavedUniversity = {
  id: string;
  university_id: string;
  status: string;
  deadline: string | null;
};
export type ResearchList = { id: string; name: string };
export type ListItem = {
  id: string;
  list_id: string;
  university_id: string;
  position: number;
};
export type Note = { id: string; university_id: string; body: string };
export type ChecklistItem = {
  id: string;
  title: string;
  done: boolean;
  due_at: string | null;
  university_id?: string | null;
};
export type SavedSearch = {
  id: string;
  name: string;
  filters: Record<string, string | number>;
};
export type SavedComparison = {
  id: string;
  name: string;
  university_ids: string[];
};
export type History = { id: string; university_id: string; viewed_at: string };
export type Workspace = {
  saved: SavedUniversity[];
  lists: ResearchList[];
  items: ListItem[];
  notes: Note[];
  checklist: ChecklistItem[];
  searches: SavedSearch[];
  comparisons: SavedComparison[];
  history: History[];
};
export const emptyWorkspace: Workspace = {
  saved: [],
  lists: [],
  items: [],
  notes: [],
  checklist: [],
  searches: [],
  comparisons: [],
  history: [],
};
const WORKSPACE_PAGE_SIZE = 200;
export const WORKSPACE_COLLECTION_LIMIT = 2000;
export const WORKSPACE_MAX_BYTES = 8 * 1024 * 1024;
export const WORKSPACE_MAX_PAGE_REQUESTS = 51;
const WORKSPACE_TIMEOUT_MS = 30000;
const collections = [
  {
    key: "saved",
    table: "saved_universities",
    label: "saved universities",
    columns: "id,user_id,university_id,status,deadline",
  },
  {
    key: "lists",
    table: "user_lists",
    label: "research collections",
    columns: "id,user_id,name",
  },
  {
    key: "items",
    table: "user_list_items",
    label: "collection items",
    columns: "id,user_id,list_id,university_id,position",
  },
  {
    key: "notes",
    table: "user_notes",
    label: "research notes",
    columns: "id,user_id,university_id,body",
  },
  {
    key: "checklist",
    table: "user_checklist",
    label: "checklist tasks",
    columns: "id,user_id,title,done,due_at,university_id",
  },
  {
    key: "searches",
    table: "saved_searches",
    label: "saved searches",
    columns: "id,user_id,name,filters",
  },
  {
    key: "comparisons",
    table: "comparison_lists",
    label: "saved comparisons",
    columns: "id,user_id,name,university_ids",
  },
  {
    key: "history",
    table: "research_history",
    label: "research history",
    columns: "id,user_id,university_id,viewed_at",
  },
] as const;
export type WorkspaceLoadOptions = { signal?: AbortSignal };
export type WorkspacePageRequest = {
  table: (typeof collections)[number]["table"];
  columns: string;
  userId: string;
  after: string | null;
  limit: number;
  signal: AbortSignal;
};
type WorkspacePageResult = { data: unknown; error: unknown };
type WorkspaceLoaderDependencies = {
  readPage: (request: WorkspacePageRequest) => Promise<WorkspacePageResult>;
  timeoutMs?: number;
};
export class WorkspaceCapacityError extends Error {
  constructor(message: string) {
    super(
      message +
        " Your saved data is unchanged. Export it from your profile or reduce the collection before retrying.",
    );
    this.name = "WorkspaceCapacityError";
  }
}
function workspaceAbortable<T>(
  operation: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener("abort", aborted, { once: true });
    operation.then(
      (value) => {
        signal.removeEventListener("abort", aborted);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", aborted);
        reject(error);
      },
    );
    if (signal.aborted) aborted();
  });
}

/** A successful return contains every row read to an empty final page, never a capped prefix. */
export function createWorkspaceLoader(deps: WorkspaceLoaderDependencies) {
  const readPage = deps.readPage;
  return async (
    userId: string,
    options: WorkspaceLoadOptions = {},
  ): Promise<Workspace> => {
    if (!isUUID(userId)) throw new Error("Sign in to access your workspace");
    const controller = new AbortController();
    const cancel = () =>
      controller.abort(
        options.signal?.reason ??
          new DOMException("Workspace load cancelled", "AbortError"),
      );
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) cancel();
    const timeoutMs = Math.min(
      WORKSPACE_TIMEOUT_MS,
      Math.max(1, deps.timeoutMs ?? WORKSPACE_TIMEOUT_MS),
    );
    const timeout = setTimeout(
      () =>
        controller.abort(
          new Error("Workspace loading timed out. Please retry."),
        ),
      timeoutMs,
    );
    let bytes = 0;
    try {
      const results = await Promise.all(
        collections.map(async (collection) => {
          const rows: Record<string, unknown>[] = [];
          let after: string | null = null;
          for (let request = 0; ; request++) {
            controller.signal.throwIfAborted();
            if (request >= WORKSPACE_MAX_PAGE_REQUESTS)
              throw new WorkspaceCapacityError(
                `Your ${collection.label} could not be fully read within ${WORKSPACE_MAX_PAGE_REQUESTS} bounded requests.`,
              );
            const limit = Math.min(
              WORKSPACE_PAGE_SIZE,
              WORKSPACE_COLLECTION_LIMIT - rows.length + 1,
            );
            const response: WorkspacePageResult = await workspaceAbortable(
              readPage({
                table: collection.table,
                columns: collection.columns,
                userId,
                after,
                limit,
                signal: controller.signal,
              }),
              controller.signal,
            );
            controller.signal.throwIfAborted();
            if (
              response.error ||
              !Array.isArray(response.data) ||
              response.data.length > limit
            )
              throw new Error("Workspace could not be loaded. Please retry.");
            // Empty, rather than short, ends the traversal: PostgREST may impose a
            // smaller server row cap than the requested page size.
            if (response.data.length === 0)
              return [collection.key, rows] as const;
            let cursor: string | null = after;
            for (const row of response.data as Record<string, unknown>[]) {
              if (
                !row ||
                typeof row !== "object" ||
                Array.isArray(row) ||
                row.user_id !== userId ||
                !isUUID(row.id) ||
                (cursor !== null && row.id <= cursor)
              )
                throw new Error(
                  "Workspace returned an unexpected response. Please retry.",
                );
              cursor = row.id;
            }
            if (rows.length + response.data.length > WORKSPACE_COLLECTION_LIMIT)
              throw new WorkspaceCapacityError(
                `Your ${collection.label} exceed the browser loading limit of ${WORKSPACE_COLLECTION_LIMIT.toLocaleString("en-US")} records.`,
              );
            bytes += new TextEncoder().encode(
              JSON.stringify(response.data),
            ).byteLength;
            if (bytes > WORKSPACE_MAX_BYTES)
              throw new WorkspaceCapacityError(
                "Your workspace exceeds the browser loading limit of 8 MiB.",
              );
            rows.push(...response.data);
            after = cursor;
          }
        }),
      );
      controller.signal.throwIfAborted();
      return Object.fromEntries(results) as Workspace;
    } catch (error) {
      // Stop sibling collections too; never return a successful-looking partial workspace.
      controller.abort(error);
      throw error;
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", cancel);
    }
  };
}
export async function loadWorkspace(
  userId: string,
  options: WorkspaceLoadOptions = {},
): Promise<Workspace> {
  const db = getSupabase();
  if (!db) throw new Error("Sign in to access your workspace");
  return createWorkspaceLoader({ readPage: createWorkspacePageReader(db) })(
    userId,
    options,
  );
}
export function createWorkspacePageReader(
  db: Pick<SupabaseClient, "from">,
): WorkspaceLoaderDependencies["readPage"] {
  return async ({ table, columns, userId, after, limit, signal }) => {
    let query = db
      .from(table)
      .select(columns)
      .eq("user_id", userId)
      .order("id", { ascending: true });
    if (after) query = query.gt("id", after);
    return query.limit(limit).abortSignal(signal);
  };
}
type AccountExportDeps = {
  timeoutMs?: number;
  url: string;
  key: string;
  session: () => Promise<{ owner: string; token: string } | null>;
  fetch: typeof fetch;
  download: (name: string, data: unknown) => void;
};
export class ExportAccountChangedError extends Error {
  constructor() {
    super(
      "Your account changed. Open your current profile and retry the export.",
    );
  }
}
export function createAccountExport(deps: AccountExportDeps) {
  const dispatch = deps.fetch;
  return async (userId: string, scope: AccountScope) => {
    const captured = scope.capture();
    const controller = new AbortController();
    const current = () => {
      if (
        !isUUID(userId) ||
        captured.owner !== userId ||
        !scope.isCurrent(captured)
      )
        throw new ExportAccountChangedError();
      controller.signal.throwIfAborted();
    };
    const unsubscribe = scope.subscribe(() =>
      controller.abort(new ExportAccountChangedError()),
    );
    const timeout = setTimeout(
      () =>
        controller.abort(
          new Error(
            "Your account export took too long. Your data is unchanged; please retry.",
          ),
        ),
      Math.min(60000, Math.max(1, deps.timeoutMs ?? 60000)),
    );
    try {
      current();
      const session = await abortable(deps.session(), controller.signal);
      current();
      if (!session || session.owner !== userId)
        throw new ExportAccountChangedError();
      const headers = {
        apikey: deps.key,
        Authorization: `Bearer ${session.token}`,
      };
      const tables = [
        "profiles",
        "saved_universities",
        "saved_scholarships",
        "comparison_lists",
        "shared_comparisons",
        "saved_searches",
        "user_lists",
        "user_list_items",
        "user_notes",
        "user_checklist",
        "fit_scores",
        "research_history",
        "notifications",
        "writing_draft_versions",
        "student_education",
        "student_test_attempts",
      ];
      const result: Record<string, unknown> = {
        exported_at: new Date().toISOString(),
      };
      let totalBytes = 0;
      for (const table of tables) {
        const collected: Record<string, unknown>[] = [];
        const ownerColumn = table === "profiles" ? "id" : "user_id";
        let cursor: string | null = null;
        let complete = false;
        for (let request = 0; request < 50001; request++) {
          current();
          const url = new URL("/rest/v1/" + table, deps.url);
          url.searchParams.set("select", "*");
          url.searchParams.set(ownerColumn, "eq." + userId);
          url.searchParams.set("order", "id.asc");
          url.searchParams.set(
            "limit",
            String(
              table === "profiles"
                ? 1
                : Math.min(1000, 50001 - collected.length),
            ),
          );
          if (cursor && table !== "profiles")
            url.searchParams.set("id", "gt." + cursor);
          const response = await abortable(
            dispatch(url, { headers, signal: controller.signal }),
            controller.signal,
          );
          current();
          if (!response.ok)
            throw new Error(
              "Account export failed. Your saved data is unchanged. Please retry.",
            );
          const rows: unknown = await abortable(
            response.json(),
            controller.signal,
          );
          current();
          if (
            !Array.isArray(rows) ||
            rows.some(
              (row) =>
                !row ||
                typeof row !== "object" ||
                row[ownerColumn] !== userId ||
                !isUUID(row.id),
            )
          )
            throw new Error(
              "Your account export returned an unexpected response. Please retry.",
            );
          if (table === "profiles" && rows.length > 1)
            throw new Error(
              "Your account export returned an unexpected response. Please retry.",
            );
          totalBytes += new TextEncoder().encode(
            JSON.stringify(rows),
          ).byteLength;
          if (
            totalBytes > 32 * 1024 * 1024 ||
            collected.length + rows.length > 50000
          )
            throw new Error(
              "This account is too large for a browser export. Your saved data is unchanged.",
            );
          for (const row of rows) {
            if (cursor !== null && row.id <= cursor)
              throw new Error(
                "Your account export could not be fully read. Please retry.",
              );
            cursor = row.id;
          }
          collected.push(...rows);
          if (table === "profiles" || rows.length === 0) {
            complete = true;
            break;
          }
        }
        if (!complete)
          throw new Error(
            "Your account export could not be fully read. Please retry.",
          );
        result[table] = collected;
      }
      current();
      deps.download("collegestat-personal-data.json", result);
    } finally {
      clearTimeout(timeout);
      unsubscribe();
      controller.abort();
    }
  };
}
export async function exportAccount(userId: string, scope: AccountScope) {
  const db = getSupabase();
  if (!db) throw new Error("Sign in first");
  return createAccountExport({
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
    download: downloadJSON,
  })(userId, scope);
}

function downloadJSON(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
