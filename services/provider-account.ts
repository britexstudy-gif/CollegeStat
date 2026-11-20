import type { AccountScope, AccountToken } from "@/lib/account-owner";
import { abortable } from "@/lib/abortable";
import { isUUID } from "@/lib/student-writing";
import { filterSchema, type Filters } from "@/lib/research";
import { getSupabase } from "@/lib/supabase/client";

export type ProviderProfile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  role: "student" | "admin";
  preferences: Record<string, unknown>;
};
export type ProviderAccountSnapshot = {
  profile: ProviderProfile;
  saved: string[];
  savedScholarships: string[];
  compare: string[] | null;
};
type Dependencies = {
  url: string;
  key: string;
  session: () => Promise<{ owner: string; token: string } | null>;
  fetch: typeof fetch;
  timeoutMs?: number;
  randomId?: () => string;
};
export class ProviderAccountChangedError extends Error {
  constructor() {
    super("Your account changed. Open your current account and retry.");
    this.name = "ProviderAccountChangedError";
  }
}
const PAGE_SIZE = 200;
const COLLECTION_LIMIT = 2000;
const MAX_PAGE_REQUESTS = 51;
const failed = () =>
  new Error("Your account change could not be confirmed. Please retry.");
function ownedRows(value: unknown, owner: string, maximum = 1) {
  if (
    !Array.isArray(value) ||
    value.length > maximum ||
    value.some(
      (row) =>
        !row ||
        typeof row !== "object" ||
        Array.isArray(row) ||
        !isUUID(row.id) ||
        row.user_id !== owner,
    )
  )
    throw failed();
  return value as Record<string, unknown>[];
}
function selection(ids: string[]) {
  if (
    !Array.isArray(ids) ||
    ids.length > 5 ||
    ids.some((id) => !isUUID(id)) ||
    new Set(ids).size !== ids.length
  )
    throw new Error("Choose up to five different universities to compare.");
  return [...ids];
}

/** Account operations never delegate credential selection to a mutable shared SDK. */
export function createProviderAccountService(deps: Dependencies) {
  const dispatch = deps.fetch;
  const newId = deps.randomId ?? (() => crypto.randomUUID());
  const run = async <T>(
    scope: AccountScope,
    captured: AccountToken,
    action: (
      request: (
        path: string,
        filters?: Record<string, string>,
        init?: RequestInit,
      ) => Promise<unknown>,
      owner: string,
    ) => Promise<T>,
    signal?: AbortSignal,
  ) => {
    const initiating = { ...captured };
    const controller = new AbortController();
    const current = () => {
      if (!isUUID(initiating.owner) || !scope.isCurrent(initiating))
        controller.abort(new ProviderAccountChangedError());
      controller.signal.throwIfAborted();
    };
    const cancel = () => controller.abort(signal?.reason);
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    const unsubscribe = scope.subscribe(() => {
      if (!scope.isCurrent(initiating))
        controller.abort(new ProviderAccountChangedError());
    });
    const timeout = setTimeout(
      () =>
        controller.abort(
          new Error("Your account request timed out. Please retry."),
        ),
      Math.min(
        10000,
        Number.isFinite(deps.timeoutMs) && (deps.timeoutMs ?? 0) > 0
          ? deps.timeoutMs!
          : 10000,
      ),
    );
    let bytes = 0;
    try {
      current();
      const session = await abortable(deps.session(), controller.signal);
      current();
      if (!session?.token || session.owner !== initiating.owner)
        throw new ProviderAccountChangedError();
      const headers = {
        apikey: deps.key,
        Authorization: "Bearer " + session.token,
        "Content-Type": "application/json",
      };
      const request = async (
        path: string,
        filters: Record<string, string> = {},
        init?: RequestInit,
      ) => {
        current();
        const url = new URL("/rest/v1/" + path, deps.url);
        for (const [key, value] of Object.entries(filters))
          url.searchParams.set(key, value);
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
        if (!response.ok) throw failed();
        const value: unknown = await abortable(
          response.json(),
          controller.signal,
        );
        current();
        bytes += new TextEncoder().encode(JSON.stringify(value)).byteLength;
        if (bytes > 8 * 1024 * 1024)
          throw new Error(
            "Your account response is too large to load. Please retry or export your data.",
          );
        return value;
      };
      const result = await action(request, initiating.owner!);
      current();
      return result;
    } catch (error) {
      current();
      // A failed account collection cancels sibling pages as well; callers
      // never keep traversing private collections after this load failed.
      controller.abort(error);
      throw error;
    } finally {
      clearTimeout(timeout);
      unsubscribe();
      signal?.removeEventListener("abort", cancel);
    }
  };
  return {
    load(scope: AccountScope, token = scope.capture(), signal?: AbortSignal) {
      return run(
        scope,
        token,
        async (request, owner): Promise<ProviderAccountSnapshot> => {
          const readSaved = async (table: string, column: string) => {
            const ids: string[] = [];
            let after: string | null = null;
            for (let page = 0; ; page++) {
              if (page >= MAX_PAGE_REQUESTS)
                throw new Error(
                  "Your saved account items could not be fully loaded. Please retry or export your data.",
                );
              const limit = Math.min(
                PAGE_SIZE,
                COLLECTION_LIMIT - ids.length + 1,
              );
              const rows = ownedRows(
                await request(table, {
                  select: "id,user_id," + column,
                  user_id: "eq." + owner,
                  order: "id.asc",
                  limit: String(limit),
                  ...(after ? { id: "gt." + after } : {}),
                }),
                owner,
                limit,
              );
              if (!rows.length) return ids;
              for (const row of rows) {
                if (
                  !isUUID(row[column]) ||
                  (after !== null && String(row.id) <= after)
                )
                  throw failed();
                ids.push(String(row[column]));
                after = String(row.id);
              }
              if (
                ids.length > COLLECTION_LIMIT ||
                new Set(ids).size !== ids.length
              )
                throw new Error(
                  "Your saved account items could not be fully loaded. Please retry or export your data.",
                );
            }
          };
          const [profileResult, saved, savedScholarships, comparisonResult] =
            await Promise.all([
              request("profiles", {
                select: "id,display_name,avatar_url,role,preferences",
                id: "eq." + owner,
                limit: "2",
              }),
              readSaved("saved_universities", "university_id"),
              readSaved("saved_scholarships", "scholarship_id"),
              request("comparison_lists", {
                select: "id,user_id,university_ids",
                user_id: "eq." + owner,
                name: "eq.My comparison",
                limit: "2",
              }),
            ]);
          if (!Array.isArray(profileResult) || profileResult.length !== 1)
            throw failed();
          const profile = profileResult[0];
          if (
            !profile ||
            profile.id !== owner ||
            (profile.role !== "student" && profile.role !== "admin") ||
            (profile.display_name !== null &&
              typeof profile.display_name !== "string") ||
            (profile.avatar_url !== null &&
              typeof profile.avatar_url !== "string") ||
            !profile.preferences ||
            typeof profile.preferences !== "object" ||
            Array.isArray(profile.preferences)
          )
            throw failed();
          const comparison = ownedRows(comparisonResult, owner);
          return {
            profile: profile as ProviderProfile,
            saved,
            savedScholarships,
            compare: comparison.length
              ? selection(comparison[0].university_ids as string[])
              : null,
          };
        },
        signal,
      );
    },
    setSaved(
      scope: AccountScope,
      id: string,
      save: boolean,
      scholarship = false,
      token = scope.capture(),
    ) {
      if (
        !isUUID(id) ||
        typeof save !== "boolean" ||
        typeof scholarship !== "boolean"
      )
        throw new Error("Choose a valid saved item.");
      const table = scholarship ? "saved_scholarships" : "saved_universities";
      const column = scholarship ? "scholarship_id" : "university_id";
      return run(scope, token, async (request, owner) => {
        const filters = {
          user_id: "eq." + owner,
          [column]: "eq." + id,
          select: "id,user_id," + column,
        };
        if (!save) {
          const rows = ownedRows(
            await request(table, filters, {
              method: "DELETE",
              headers: { Prefer: "return=representation" },
            }),
            owner,
          );
          if (rows.some((row) => row[column] !== id)) throw failed();
          return;
        }
        let rows = ownedRows(
          await request(
            table,
            { on_conflict: "user_id," + column, select: filters.select },
            {
              method: "POST",
              headers: {
                Prefer: "resolution=ignore-duplicates,return=representation",
              },
              body: JSON.stringify({ user_id: owner, [column]: id }),
            },
          ),
          owner,
        );
        if (!rows.length)
          rows = ownedRows(
            await request(table, { ...filters, limit: "2" }),
            owner,
          );
        if (rows.length !== 1 || rows[0][column] !== id) throw failed();
      });
    },
    saveComparison(
      scope: AccountScope,
      input: string[],
      token = scope.capture(),
    ) {
      const ids = selection(input);
      return run(scope, token, async (request) => {
        const id = await request(
          "rpc/save_comparison",
          {},
          {
            method: "POST",
            body: JSON.stringify({ ids, list_name: "My comparison" }),
          },
        );
        if (!isUUID(id)) throw failed();
        return id;
      });
    },
    recordView(
      scope: AccountScope,
      universityId: string,
      token = scope.capture(),
    ) {
      if (!isUUID(universityId)) throw new Error("Choose a valid university.");
      const viewedAt = new Date().toISOString();
      return run(scope, token, async (request, owner) => {
        const rows = ownedRows(
          await request(
            "research_history",
            {
              on_conflict: "user_id,university_id",
              select: "id,user_id,university_id",
            },
            {
              method: "POST",
              headers: {
                Prefer: "resolution=merge-duplicates,return=representation",
              },
              body: JSON.stringify({
                user_id: owner,
                university_id: universityId,
                viewed_at: viewedAt,
              }),
            },
          ),
          owner,
        );
        if (rows.length !== 1 || rows[0].university_id !== universityId)
          throw failed();
      });
    },
    saveSearch(
      scope: AccountScope,
      name: string,
      input: Partial<Filters>,
      id = newId(),
      token = scope.capture(),
    ) {
      if (
        typeof name !== "string" ||
        !name.trim() ||
        name.length > 200 ||
        !isUUID(id)
      )
        throw new Error(
          "Choose a name of up to 200 characters for this search.",
        );
      const filters = filterSchema.strict().parse(input);
      const payload = { id, name: name.trim(), filters };
      return run(scope, token, async (request, owner) => {
        let rows = ownedRows(
          await request(
            "saved_searches",
            { on_conflict: "id", select: "id,user_id,name,filters" },
            {
              method: "POST",
              headers: {
                Prefer: "resolution=ignore-duplicates,return=representation",
              },
              body: JSON.stringify({ ...payload, user_id: owner }),
            },
          ),
          owner,
        );
        if (!rows.length)
          rows = ownedRows(
            await request("saved_searches", {
              id: "eq." + id,
              user_id: "eq." + owner,
              select: "id,user_id,name,filters",
              limit: "2",
            }),
            owner,
          );
        if (
          rows.length !== 1 ||
          rows[0].id !== id ||
          rows[0].name !== payload.name ||
          !rows[0].filters ||
          typeof rows[0].filters !== "object" ||
          Array.isArray(rows[0].filters) ||
          Object.keys(rows[0].filters).length !==
            Object.keys(filters).filter(
              (key) => filters[key as keyof Filters] !== undefined,
            ).length ||
          Object.entries(filters)
            .filter(([, value]) => value !== undefined)
            .some(
              ([key, value]) =>
                (rows[0].filters as Record<string, unknown>)[key] !== value,
            )
        )
          throw failed();
        return id;
      });
    },
  };
}

function connectedService() {
  const db = getSupabase();
  if (!db) throw new Error("Sign in to manage your research.");
  return createProviderAccountService({
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
export const loadProviderAccount = (
  scope: AccountScope,
  token: AccountToken,
  signal?: AbortSignal,
) => connectedService().load(scope, token, signal);
export const setProviderSaved = (
  scope: AccountScope,
  id: string,
  saved: boolean,
  scholarship: boolean,
  token: AccountToken,
) => connectedService().setSaved(scope, id, saved, scholarship, token);
export const saveProviderComparison = (
  scope: AccountScope,
  ids: string[],
  token: AccountToken,
) => connectedService().saveComparison(scope, ids, token);
export const recordProviderView = (
  scope: AccountScope,
  universityId: string,
  token: AccountToken,
) => connectedService().recordView(scope, universityId, token);
export const saveProviderSearch = (
  scope: AccountScope,
  name: string,
  filters: Partial<Filters>,
  id: string,
  token: AccountToken,
) => connectedService().saveSearch(scope, name, filters, id, token);
