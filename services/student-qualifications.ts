import { getSupabase } from "@/lib/supabase/client";
import type { AccountScope } from "@/lib/account-owner";
import { abortable } from "@/lib/abortable";
import { isUUID } from "@/lib/student-writing";
import {
  educationInput,
  testInput,
  qualificationRecord,
  type EducationInput,
  type TestInput,
  type EducationRecord,
  type TestRecord,
  type Qualifications,
} from "@/lib/student-qualifications";

type Dependencies = {
  url: string;
  key: string;
  session: () => Promise<{ owner: string; token: string } | null>;
  fetch: typeof fetch;
  timeoutMs?: number;
};
type Kind = "education" | "tests";
const tables = {
  education: "student_education",
  tests: "student_test_attempts",
};
const columns = {
  education:
    "id,user_id,qualification,country_code,curriculum,level,status,graduation_year,grade_label,grade_scale,created_at",
  tests:
    "id,user_id,kind,label,status,taken_on,score_label,scale_label,created_at",
};
export class QualificationAccountChangedError extends Error {
  constructor() {
    super("Your account changed. Open your current private profile and retry.");
  }
}
export function createStudentQualificationService(deps: Dependencies) {
  const dispatch = deps.fetch;
  async function access<T>(
    scope: AccountScope,
    work: (context: {
      owner: string;
      rows: (
        kind: Kind,
        params?: Record<string, string>,
        init?: RequestInit,
      ) => Promise<(EducationRecord | TestRecord)[]>;
    }) => Promise<T>,
  ) {
    const captured = scope.capture();
    const controller = new AbortController();
    const current = () => {
      if (!isUUID(captured.owner) || !scope.isCurrent(captured))
        throw new QualificationAccountChangedError();
      controller.signal.throwIfAborted();
    };
    const unsubscribe = scope.subscribe(() =>
      controller.abort(new QualificationAccountChangedError()),
    );
    const timeout = setTimeout(
      () =>
        controller.abort(
          new Error(
            "Your private qualification request took too long. Keep your edits and retry.",
          ),
        ),
      Math.min(15000, Math.max(1, deps.timeoutMs ?? 15000)),
    );
    try {
      current();
      const session = await abortable(deps.session(), controller.signal);
      current();
      if (!session || session.owner !== captured.owner)
        throw new QualificationAccountChangedError();
      const owner = session.owner;
      async function rows(
        kind: Kind,
        params: Record<string, string> = {},
        init?: RequestInit,
      ) {
        current();
        const url = new URL("/rest/v1/" + tables[kind], deps.url);
        url.searchParams.set("select", columns[kind]);
        for (const [key, value] of Object.entries(params))
          url.searchParams.set(key, value);
        url.searchParams.set("user_id", "eq." + owner);
        const response = await abortable(
          dispatch(url, {
            ...init,
            signal: controller.signal,
            headers: {
              apikey: deps.key,
              Authorization: "Bearer " + session!.token,
              "Content-Type": "application/json",
              ...init?.headers,
            },
          }),
          controller.signal,
        );
        current();
        if (!response.ok)
          throw new Error(
            "Private qualification records could not be accessed. Your edits are kept; please retry.",
          );
        const result: unknown = await abortable(
          response.json(),
          controller.signal,
        );
        current();
        if (
          !Array.isArray(result) ||
          result.some((row) => !qualificationRecord(kind, row, owner))
        )
          throw new Error(
            "Private qualification records returned an unexpected response. Please retry.",
          );
        return result as (EducationRecord | TestRecord)[];
      }
      const result = await work({ owner, rows });
      current();
      return result;
    } finally {
      clearTimeout(timeout);
      unsubscribe();
      controller.abort();
    }
  }
  async function save(
    scope: AccountScope,
    kind: Kind,
    input: EducationInput | TestInput,
  ) {
    const parsed = (
      kind === "education" ? educationInput : testInput
    ).safeParse(input);
    if (!parsed.success)
      throw new Error(
        parsed.error.issues[0]?.message || "Check this qualification record.",
      );
    const draft = parsed.data;
    return access(scope, async (ctx) => {
      let rows = await ctx.rows(
        kind,
        { on_conflict: "id" },
        {
          method: "POST",
          headers: {
            Prefer: "resolution=ignore-duplicates,return=representation",
          },
          body: JSON.stringify({ ...draft, user_id: ctx.owner }),
        },
      );
      if (!rows.length)
        rows = await ctx.rows(kind, { id: "eq." + draft.id, limit: "1" });
      const row = rows[0];
      if (
        rows.length !== 1 ||
        !row ||
        Object.entries(draft).some(
          ([key, value]) => row[key as keyof typeof row] !== value,
        )
      )
        throw new Error(
          "This qualification save could not be confirmed. Keep your edits and retry.",
        );
      return row;
    });
  }
  return {
    async load(scope: AccountScope): Promise<Qualifications> {
      return access(scope, async (ctx) => {
        const read = async (kind: Kind) => {
          const collected: (EducationRecord | TestRecord)[] = [];
          let cursor: string | null = null;
          for (let request = 0; request < 101; request++) {
            const rows = await ctx.rows(kind, {
              order: "id.asc",
              limit: String(Math.min(50, 101 - collected.length)),
              ...(cursor ? { id: "gt." + cursor } : {}),
            });
            if (!rows.length) return collected;
            for (const row of rows) {
              if (cursor !== null && row.id <= cursor)
                throw new Error(
                  "Your qualification history could not be fully read. Please retry.",
                );
              cursor = row.id;
            }
            if (collected.length + rows.length > 100)
              throw new Error(
                "This private collection is too large for the profile view. Export your records or remove an old record before retrying.",
              );
            collected.push(...rows);
          }
          throw new Error(
            "Your qualification history could not be fully read. Please retry.",
          );
        };
        const [education, tests] = await Promise.all([
          read("education"),
          read("tests"),
        ]);
        return {
          education: education as EducationRecord[],
          tests: tests as TestRecord[],
        };
      });
    },
    saveEducation: (scope: AccountScope, input: EducationInput) =>
      save(scope, "education", input) as Promise<EducationRecord>,
    saveTest: (scope: AccountScope, input: TestInput) =>
      save(scope, "tests", input) as Promise<TestRecord>,
    async remove(scope: AccountScope, kind: Kind, id: string) {
      if (!["education", "tests"].includes(kind) || !isUUID(id))
        throw new Error("Choose a saved qualification record.");
      return access(scope, async (ctx) => {
        const rows = await ctx.rows(
          kind,
          { id: "eq." + id },
          { method: "DELETE", headers: { Prefer: "return=representation" } },
        );
        if (rows.length > 1 || rows.some((row) => row.id !== id))
          throw new Error("This removal could not be confirmed. Please retry.");
      });
    },
  };
}
function connectedService() {
  const db = getSupabase();
  if (!db)
    throw new Error("Sign in to use your private qualification profile.");
  return createStudentQualificationService({
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
export const loadQualifications = (scope: AccountScope) =>
  connectedService().load(scope);
export const saveEducationRecord = (
  scope: AccountScope,
  input: EducationInput,
) => connectedService().saveEducation(scope, input);
export const saveTestRecord = (scope: AccountScope, input: TestInput) =>
  connectedService().saveTest(scope, input);
export const removeQualificationRecord = (
  scope: AccountScope,
  kind: Kind,
  id: string,
) => connectedService().remove(scope, kind, id);
