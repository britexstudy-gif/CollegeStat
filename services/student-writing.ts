import type { AccountScope } from "@/lib/account-owner";
import { getSupabase } from "@/lib/supabase/client";
import {
  isUUID,
  isWritingFormat,
  isWritingVersion,
  writingDraftLimit,
  writingVersionPageSize,
  type WritingFormat,
  type WritingVersion,
} from "@/lib/student-writing";

export class WritingAccountChangedError extends Error {
  constructor() {
    super("Your account changed. Open your current writing desk and retry.");
  }
}
type WritingDeps = {
  url: string;
  key: string;
  session: () => Promise<{ owner: string; token: string } | null>;
  fetch: typeof fetch;
};
const selection = "id,user_id,format,body,created_at";
export function createStudentWritingService(deps: WritingDeps) {
  const dispatch = deps.fetch;
  async function access(scope: AccountScope) {
    const captured = scope.capture();
    const current = () => {
      if (!isUUID(captured.owner) || !scope.isCurrent(captured))
        throw new WritingAccountChangedError();
    };
    current();
    const session = await deps.session();
    current();
    if (!session || session.owner !== captured.owner)
      throw new WritingAccountChangedError();
    const owner = captured.owner!;
    const headers = {
      apikey: deps.key,
      Authorization: `Bearer ${session.token}`,
      "Content-Type": "application/json",
    };
    const url = () => {
      const value = new URL("/rest/v1/writing_draft_versions", deps.url);
      value.searchParams.set("user_id", "eq." + owner);
      return value;
    };
    async function request(value: URL, init?: RequestInit) {
      current();
      let response: Response;
      try {
        response = await dispatch(value, {
          ...init,
          headers: { ...headers, ...init?.headers },
          signal: AbortSignal.timeout(10000),
        });
      } catch {
        current();
        throw new Error(
          "Your writing could not reach your account. Keep this draft and retry.",
        );
      }
      current();
      if (!response.ok)
        throw new Error(
          "Your saved writing could not be accessed. Keep this draft and retry.",
        );
      return response;
    }
    async function rows(value: URL, init?: RequestInit) {
      const response = await request(value, init);
      const body: unknown = await response.json();
      current();
      if (
        !Array.isArray(body) ||
        body.some((row) => !isWritingVersion(row) || row.user_id !== owner)
      )
        throw new Error(
          "Your saved writing returned an unexpected response. Keep this draft and retry.",
        );
      return body as WritingVersion[];
    }
    return { owner, url, request, rows };
  }
  return {
    async load(scope: AccountScope, format: WritingFormat, offset = 0) {
      if (
        !isWritingFormat(format) ||
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        offset > 100000
      )
        throw new Error("Choose a valid writing format and history page.");
      const ctx = await access(scope);
      const url = ctx.url();
      url.searchParams.set("select", selection);
      url.searchParams.set("format", "eq." + format);
      url.searchParams.set("order", "created_at.desc,id.desc");
      url.searchParams.set("limit", String(writingVersionPageSize));
      url.searchParams.set("offset", String(offset));
      const rows = await ctx.rows(url);
      if (rows.some((row) => row.format !== format))
        throw new Error(
          "The saved writing format did not match. Please retry.",
        );
      return rows;
    },
    async save(
      scope: AccountScope,
      input: { id: string; format: WritingFormat; body: string },
    ) {
      // Copy before the first await so editing while a save is pending cannot change its contents.
      const draft = { id: input.id, format: input.format, body: input.body };
      if (
        !isUUID(draft.id) ||
        !isWritingFormat(draft.format) ||
        typeof draft.body !== "string" ||
        !draft.body.trim() ||
        draft.body.length > writingDraftLimit
      )
        throw new Error(
          "Write a draft between 1 and 20,000 characters before saving.",
        );
      const ctx = await access(scope);
      const url = ctx.url();
      url.searchParams.set("select", selection);
      url.searchParams.set("on_conflict", "id");
      const result = await ctx.rows(url, {
        method: "POST",
        headers: {
          Prefer: "resolution=ignore-duplicates,return=representation",
        },
        body: JSON.stringify({ ...draft, user_id: ctx.owner }),
      });
      let row = result[0];
      if (!row) {
        const retry = ctx.url();
        retry.searchParams.set("select", selection);
        retry.searchParams.set("id", "eq." + draft.id);
        retry.searchParams.set("limit", "1");
        row = (await ctx.rows(retry))[0];
      }
      if (
        !row ||
        row.id !== draft.id ||
        row.format !== draft.format ||
        row.body !== draft.body
      )
        throw new Error(
          "This save could not be confirmed. Keep this draft and retry.",
        );
      return row;
    },
    async remove(scope: AccountScope, id: string) {
      if (!isUUID(id)) throw new Error("Choose a valid saved version.");
      const ctx = await access(scope);
      const url = ctx.url();
      url.searchParams.set("id", "eq." + id);
      await ctx.request(url, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
    },
  };
}
function connectedService() {
  const db = getSupabase();
  if (!db) throw new Error("Sign in to save your writing.");
  return createStudentWritingService({
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
export const loadWritingVersions = (
  scope: AccountScope,
  format: WritingFormat,
  offset = 0,
) => connectedService().load(scope, format, offset);
export const saveWritingVersion = (
  scope: AccountScope,
  draft: { id: string; format: WritingFormat; body: string },
) => connectedService().save(scope, draft);
export const removeWritingVersion = (scope: AccountScope, id: string) =>
  connectedService().remove(scope, id);
