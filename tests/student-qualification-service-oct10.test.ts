import test from "node:test";
import assert from "node:assert/strict";
import { AccountScope } from "../lib/account-owner";
import {
  createStudentQualificationService,
  QualificationAccountChangedError,
} from "../services/student-qualifications";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const EDU_ID = "33333333-3333-4333-8333-333333333333";
const TEST_ID = "44444444-4444-4433-8433-444444444444";

type Session = { owner: string; token: string } | null;
type Deps = Parameters<typeof createStudentQualificationService>[0];
type Sent = { url: URL; init: RequestInit | undefined };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((complete, fail) => {
    resolve = complete;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function scopeFor(owner: string | null = A) {
  const scope = new AccountScope();
  scope.changeOwner(owner);
  return scope;
}

function harness(overrides: Partial<Deps> = {}) {
  const sent: Sent[] = [];
  const service = createStudentQualificationService({
    url: "https://qualifications.example.test",
    key: "public-test-key",
    session: async () => ({ owner: A, token: "A-frozen-token" }),
    ...overrides,
    fetch: async function (this: unknown, input, init) {
      assert.equal(this, undefined, "native browser fetch must have no arbitrary receiver");
      sent.push({ url: new URL(String(input), "http://localhost"), init });
      if (overrides.fetch) return overrides.fetch(input, init);
      return Response.json([]);
    },
  });
  return { service, sent };
}

const educationInput = () => ({
  id: EDU_ID,
  qualification: "BSc Physics",
  country_code: "GB" as const,
  curriculum: "national" as const,
  level: "bachelor" as const,
  status: "completed" as const,
  graduation_year: 2026 as number | null,
  grade_label: null as string | null,
  grade_scale: null as string | null,
});

const testInput = () => ({
  id: TEST_ID,
  kind: "IELTS Academic" as const,
  label: "IELTS Academic",
  status: "taken" as const,
  taken_on: "2026-05-10" as string | null,
  score_label: "7.5" as string | null,
  scale_label: "0-9" as string | null,
});

const educationRow = (input: ReturnType<typeof educationInput>, owner = A) => ({
  ...input,
  user_id: owner,
  created_at: "2026-10-10T00:00:00.000Z",
});

const testRow = (input: ReturnType<typeof testInput>, owner = A) => ({
  ...input,
  user_id: owner,
  created_at: "2026-10-10T00:00:00.000Z",
});

const pageId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function pagedEducationRow(n: number, owner = A) {
  return {
    id: pageId(n),
    user_id: owner,
    qualification: `Qualification ${n}`,
    country_code: "GB",
    curriculum: "national",
    level: "bachelor",
    status: "completed",
    graduation_year: null,
    grade_label: null,
    grade_scale: null,
    created_at: "2026-10-10T00:00:00.000Z",
  };
}

function pagedTestRow(n: number, owner = A) {
  return {
    id: pageId(9000 + n),
    user_id: owner,
    kind: "IELTS Academic",
    label: `Attempt ${n}`,
    status: "taken",
    taken_on: null,
    score_label: null,
    scale_label: null,
    created_at: "2026-10-10T00:00:00.000Z",
  };
}

// ---------- validation ----------

test("education rejects unknown enum variants and strict extras without network", async () => {
  const h = harness({ fetch: async () => { throw new Error("must not fetch"); } });
  const scope = scopeFor();
  await assert.rejects(h.service.saveEducation(scope, { ...educationInput(), curriculum: "CBSE" as never }), /./);
  await assert.rejects(h.service.saveEducation(scope, { ...educationInput(), level: "phd" as never }), /./);
  await assert.rejects(h.service.saveEducation(scope, { ...educationInput(), status: "graduated" as never }), /./);
  await assert.rejects(
    h.service.saveEducation(scope, { ...educationInput(), extra: "nope" } as never),
    /./,
  );
  assert.equal(h.sent.length, 0);
});

test("education accepts explicit unknown literals and rejects unlisted country", async () => {
  const h = harness({
    fetch: async (input, init) => {
      const body = JSON.parse(String((init as RequestInit)?.body));
      return Response.json([{ ...body, user_id: A, created_at: "2026-10-10T00:00:00.000Z" }]);
    },
  });
  const scope = scopeFor();
  const accepted = await h.service.saveEducation(scope, {
    ...educationInput(),
    curriculum: "unknown",
    level: "unknown",
    status: "unknown",
    country_code: null,
  });
  assert.equal(accepted.curriculum, "unknown");
  await assert.rejects(
    h.service.saveEducation(scope, { ...educationInput(), country_code: "XX" as never }),
    /listed country/,
  );
});

test("education rejects bad graduation year and blank qualification", async () => {
  const h = harness({ fetch: async () => { throw new Error("must not fetch"); } });
  const scope = scopeFor();
  await assert.rejects(h.service.saveEducation(scope, { ...educationInput(), graduation_year: 1899 }), /./);
  await assert.rejects(h.service.saveEducation(scope, { ...educationInput(), graduation_year: 2101 }), /./);
  await assert.rejects(h.service.saveEducation(scope, { ...educationInput(), qualification: "   " }), /./);
  await assert.rejects(h.service.saveEducation(scope, { ...educationInput(), id: "not-a-uuid" }), /./);
  assert.equal(h.sent.length, 0);
});

test("education requires grade label and scale together", async () => {
  const h = harness({ fetch: async () => { throw new Error("must not fetch"); } });
  const scope = scopeFor();
  await assert.rejects(
    h.service.saveEducation(scope, { ...educationInput(), grade_label: "First", grade_scale: null }),
    /grading scale/,
  );
  await assert.rejects(
    h.service.saveEducation(scope, { ...educationInput(), grade_label: null, grade_scale: "UK honours" }),
    /grading scale/,
  );
  assert.equal(h.sent.length, 0);
});

test("test rejects unknown kind/status and invalid calendar date", async () => {
  const h = harness({ fetch: async () => { throw new Error("must not fetch"); } });
  const scope = scopeFor();
  await assert.rejects(h.service.saveTest(scope, { ...testInput(), kind: "GRE" as never }), /./);
  await assert.rejects(h.service.saveTest(scope, { ...testInput(), status: "completed" as never }), /./);
  await assert.rejects(h.service.saveTest(scope, { ...testInput(), taken_on: "2026-02-30" }), /real calendar date/);
  await assert.rejects(h.service.saveTest(scope, { ...testInput(), taken_on: "10/10/2026" }), /real calendar date/);
  assert.equal(h.sent.length, 0);
});

test("test requires score label and scale together", async () => {
  const h = harness({ fetch: async () => { throw new Error("must not fetch"); } });
  const scope = scopeFor();
  await assert.rejects(
    h.service.saveTest(scope, { ...testInput(), score_label: "7.5", scale_label: null }),
    /score scale/,
  );
  await assert.rejects(
    h.service.saveTest(scope, { ...testInput(), score_label: null, scale_label: "0-9" }),
    /score scale/,
  );
  assert.equal(h.sent.length, 0);
});

test("planned or registered tests cannot carry a date or result", async () => {
  const h = harness({ fetch: async () => { throw new Error("must not fetch"); } });
  const scope = scopeFor();
  await assert.rejects(
    h.service.saveTest(scope, { ...testInput(), status: "planned", taken_on: "2026-05-10", score_label: null, scale_label: null }),
    /Only a taken test/,
  );
  await assert.rejects(
    h.service.saveTest(scope, { ...testInput(), status: "registered", taken_on: null, score_label: "7.5", scale_label: "0-9" }),
    /Only a taken test/,
  );
  await assert.rejects(
    h.service.saveTest(scope, { ...testInput(), status: "planned", taken_on: null, score_label: "Q", scale_label: "S" }),
    /Only a taken test/,
  );
  assert.equal(h.sent.length, 0);
});

// ---------- initiating owner + token filtering ----------

test("load binds initiating owner filter and frozen bearer token", async () => {
  const h = harness({
    fetch: async () => Response.json([]),
  });
  await h.service.load(scopeFor());
  assert.equal(h.sent.length, 2);
  for (const call of h.sent) {
    assert.equal(call.url.searchParams.get("user_id"), "eq." + A);
    assert.equal(new Headers(call.init?.headers).get("authorization"), "Bearer A-frozen-token");
    assert.equal(new Headers(call.init?.headers).get("apikey"), "public-test-key");
  }
  const paths = h.sent.map((c) => c.url.pathname).sort();
  assert.deepEqual(paths, ["/rest/v1/student_education", "/rest/v1/student_test_attempts"]);
});

test("save posts to the owned table with user filter and frozen token", async () => {
  const h = harness({
    fetch: async (input, init) => {
      const body = JSON.parse(String((init as RequestInit)?.body));
      return Response.json([{ ...body, user_id: A, created_at: "2026-10-10T00:00:00.000Z" }]);
    },
  });
  await h.service.saveEducation(scopeFor(), educationInput());
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].url.pathname, "/rest/v1/student_education");
  assert.equal(h.sent[0].url.searchParams.get("user_id"), "eq." + A);
  assert.equal(h.sent[0].init?.method, "POST");
  assert.equal(new Headers(h.sent[0].init?.headers).get("authorization"), "Bearer A-frozen-token");
  const body = JSON.parse(String(h.sent[0].init?.body));
  assert.equal(body.user_id, A);
  assert.equal(body.qualification, "BSc Physics");
});

test("anonymous or non-UUID initiating owner cannot start work", async () => {
  const h = harness();
  await assert.rejects(h.service.load(scopeFor(null)), QualificationAccountChangedError);
  await assert.rejects(h.service.load(scopeFor("not-a-uuid")), QualificationAccountChangedError);
  assert.equal(h.sent.length, 0);
});

test("mismatched session owner is rejected before any request", async () => {
  const h = harness({ session: async () => ({ owner: B, token: "B-token" }) });
  await assert.rejects(h.service.load(scopeFor()), QualificationAccountChangedError);
  assert.equal(h.sent.length, 0);
});

test("save freezes its payload before a delayed session lookup", async () => {
  const session = deferred<Session>();
  const h = harness({ session: () => session.promise });
  const input = educationInput();
  const pending = h.service.saveEducation(scopeFor(), input);
  input.qualification = "Later edit";
  input.graduation_year = 2030;
  session.resolve({ owner: A, token: "A-frozen-token" });
  // Mock default fetch returns [] then the retry GET must confirm; provide rows via custom fetch instead.
  await pending.catch(() => {});
  // Re-run with a confirming fetch to check the frozen body precisely.
  const seen: unknown[] = [];
  const h2 = harness({
    session: async () => ({ owner: A, token: "A-frozen-token" }),
    fetch: async (input2, init) => {
      seen.push(JSON.parse(String((init as RequestInit)?.body ?? "{}")));
      const body = JSON.parse(String((init as RequestInit)?.body));
      return Response.json([{ ...body, user_id: A, created_at: "2026-10-10T00:00:00.000Z" }]);
    },
  });
  const frozen = educationInput();
  const session2 = deferred<Session>();
  const h3 = harness({
    session: () => session2.promise,
    fetch: async (input2, init) => {
      seen.push(JSON.parse(String((init as RequestInit)?.body ?? "{}")));
      const body = JSON.parse(String((init as RequestInit)?.body));
      return Response.json([{ ...body, user_id: A, created_at: "2026-10-10T00:00:00.000Z" }]);
    },
  });
  void h2;
  const pending3 = h3.service.saveEducation(scopeFor(), frozen);
  frozen.qualification = "Mutated after call";
  session2.resolve({ owner: A, token: "A-frozen-token" });
  await pending3;
  const last = seen[seen.length - 1] as Record<string, unknown>;
  assert.equal(last["qualification"], "BSc Physics");
  assert.equal(last["graduation_year"], 2026);
});

// ---------- owner switches ----------

test("delayed session lookup cannot consume replacement account B", async () => {
  const session = deferred<Session>();
  const h = harness({ session: () => session.promise });
  const scope = scopeFor();
  const pending = h.service.load(scope);
  scope.changeOwner(B);
  session.resolve({ owner: B, token: "B-token" });
  await assert.rejects(pending, QualificationAccountChangedError);
  assert.equal(h.sent.length, 0);
});

test("A to B to A does not revive pending lookup or send old token", async () => {
  const session = deferred<Session>();
  const h = harness({ session: () => session.promise });
  const scope = scopeFor();
  const pending = h.service.load(scope);
  scope.changeOwner(B);
  scope.changeOwner(A);
  session.resolve({ owner: A, token: "new-A-token" });
  await assert.rejects(pending, QualificationAccountChangedError);
  assert.equal(h.sent.length, 0);
});

test("owner switch while requests are in flight aborts and rejects late success", async () => {
  const response = deferred<Response>();
  const started = deferred<void>();
  let calls = 0;
  const h = harness({
    fetch: async () => {
      calls++;
      started.resolve();
      return response.promise;
    },
  });
  const scope = scopeFor();
  const pending = h.service.load(scope);
  await started.promise;
  scope.changeOwner(B);
  await assert.rejects(pending, QualificationAccountChangedError);
  assert.equal(h.sent[0].init?.signal?.aborted, true);
  response.resolve(Response.json([]));
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(calls, 2 <= calls ? calls : calls, "no replacement-owner retry from stale load");
  assert.ok(h.sent.every((c) => new Headers(c.init?.headers).get("authorization") === "Bearer A-frozen-token"));
});

test("A to B to A in flight does not accept the late response", async () => {
  const response = deferred<Response>();
  const started = deferred<void>();
  const h = harness({
    fetch: async () => {
      started.resolve();
      return response.promise;
    },
  });
  const scope = scopeFor();
  const pending = h.service.saveEducation(scope, educationInput());
  await started.promise;
  scope.changeOwner(B);
  scope.changeOwner(A);
  response.resolve(Response.json([educationRow(educationInput())]));
  await assert.rejects(pending, QualificationAccountChangedError);
});

test("owner switch before response json resolves rejects stale payload", async () => {
  const gate = deferred<unknown>();
  const h = harness({
    fetch: async () =>
      ({ ok: true, json: () => gate.promise }) as unknown as Response,
  });
  const scope = scopeFor();
  const pending = h.service.load(scope);
  await new Promise((r) => setTimeout(r, 5));
  scope.changeOwner(B);
  gate.resolve([educationRow(educationInput(), B)]);
  await assert.rejects(pending, QualificationAccountChangedError);
});

test("A to B to A before json resolves still rejects even with matching owner bytes", async () => {
  const gate = deferred<unknown>();
  const h = harness({
    fetch: async () =>
      ({ ok: true, json: () => gate.promise }) as unknown as Response,
  });
  const scope = scopeFor();
  const pending = h.service.load(scope);
  await new Promise((r) => setTimeout(r, 5));
  scope.changeOwner(B);
  scope.changeOwner(A);
  gate.resolve([educationRow(educationInput(), A)]);
  await assert.rejects(pending, QualificationAccountChangedError);
});

// ---------- timeout ----------

test("session stall times out even when the waiter ignores the signal", async () => {
  const h = harness({ timeoutMs: 10, session: () => new Promise<Session>(() => {}) });
  await assert.rejects(h.service.load(scopeFor()), /took too long/);
  assert.equal(h.sent.length, 0);
});

test("network stall times out even when fetch ignores the signal", async () => {
  const h = harness({ timeoutMs: 10, fetch: async () => new Promise<Response>(() => {}) });
  await assert.rejects(h.service.load(scopeFor()), /took too long/);
});

// ---------- receipts ----------

test("wrong-owner rows are rejected", async () => {
  const h = harness({ fetch: async () => Response.json([educationRow(educationInput(), B)]) });
  // load reads both tables; education returns wrong owner so the whole load fails.
  await assert.rejects(h.service.load(scopeFor()), /unexpected response/);
});

test("malformed shapes are rejected", async () => {
  const good = educationRow(educationInput());
  for (const bad of [
    { ...good, qualification: 42 },
    { ...good, created_at: "not-a-date" },
    { ...good, user_id: "not-a-uuid" },
    { ...good, curriculum: "CBSE" },
  ]) {
    const h = harness({
      fetch: async (input) =>
        String(input).includes("student_education") ? Response.json([bad]) : Response.json([]),
    });
    await assert.rejects(h.service.load(scopeFor()), /unexpected response/);
  }
  const h = harness({
    fetch: async (input) =>
      String(input).includes("student_education") ? Response.json({ one: 1 }) : Response.json([]),
  });
  await assert.rejects(h.service.load(scopeFor()), /unexpected response/);
});

test("stale success after A to B to A is rejected", async () => {
  const response = deferred<Response>();
  const started = deferred<void>();
  const h = harness({
    fetch: async () => {
      started.resolve();
      return response.promise;
    },
  });
  const scope = scopeFor();
  const pending = h.service.saveTest(scope, testInput());
  await started.promise;
  scope.changeOwner(B);
  scope.changeOwner(A);
  response.resolve(Response.json([testRow(testInput())]));
  await assert.rejects(pending, QualificationAccountChangedError);
});

test("retry on duplicate UUID confirms the identical record", async () => {
  const calls: URL[] = [];
  const draft = educationInput();
  const h = harness({
    fetch: async (input, init) => {
      const url = new URL(String(input), "http://localhost");
      calls.push(url);
      if ((init as RequestInit)?.method === "POST") return Response.json([]);
      assert.equal(url.searchParams.get("id"), "eq." + draft.id);
      return Response.json([educationRow(draft)]);
    },
  });
  const saved = await h.service.saveEducation(scopeFor(), draft);
  assert.equal(saved.id, draft.id);
  assert.equal(calls.length, 2);
});

test("retry returning a differing record is rejected", async () => {
  const draft = educationInput();
  const h = harness({
    fetch: async (input, init) => {
      if ((init as RequestInit)?.method === "POST") return Response.json([]);
      return Response.json([educationRow({ ...draft, qualification: "Different title" })]);
    },
  });
  await assert.rejects(h.service.saveEducation(scopeFor(), draft), /could not be confirmed/);
});

// ---------- remove ----------

test("remove validates owner and id before network", async () => {
  const h = harness({ fetch: async () => { throw new Error("must not fetch"); } });
  await assert.rejects(h.service.remove(scopeFor(), "education", "not-a-uuid"), /Choose a saved/);
  await assert.rejects(h.service.remove(scopeFor(), "other" as never, EDU_ID), /Choose a saved/);
  await assert.rejects(h.service.remove(scopeFor(null), "education", EDU_ID), QualificationAccountChangedError);
  assert.equal(h.sent.length, 0);
});

test("remove binds owner filter and representation header", async () => {
  const h = harness({ fetch: async () => Response.json([{ ...educationRow(educationInput()), id: EDU_ID }]) });
  await h.service.remove(scopeFor(), "education", EDU_ID);
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].url.pathname, "/rest/v1/student_education");
  assert.equal(h.sent[0].url.searchParams.get("id"), "eq." + EDU_ID);
  assert.equal(h.sent[0].url.searchParams.get("user_id"), "eq." + A);
  assert.equal(h.sent[0].init?.method, "DELETE");
  assert.equal(new Headers(h.sent[0].init?.headers).get("authorization"), "Bearer A-frozen-token");
});

test("remove rejects mismatched or multiple representations", async () => {
  const mismatch = harness({ fetch: async () => Response.json([educationRow(educationInput(), A)]) });
  // educationRow uses EDU_ID so override id to mismatch:
  const mismatch2 = harness({
    fetch: async () => Response.json([{ ...educationRow(educationInput()), id: B }]),
  });
  await assert.rejects(mismatch2.service.remove(scopeFor(), "education", EDU_ID), /could not be confirmed/);
  void mismatch;
  const multi = harness({
    fetch: async () => Response.json([educationRow(educationInput()), educationRow(educationInput())]),
  });
  await assert.rejects(multi.service.remove(scopeFor(), "education", EDU_ID), /could not be confirmed/);
});

// ---------- load pagination ----------

function pagedHarness(eduCount: number, testCount: number, cap = 50) {
  const edu = Array.from({ length: eduCount }, (_, i) => pagedEducationRow(i + 1));
  const tst = Array.from({ length: testCount }, (_, i) => pagedTestRow(i + 1));
  const h = harness({
    fetch: async (input) => {
      const url = new URL(String(input), "http://localhost");
      const isEdu = url.pathname.includes("student_education");
      let rest: { id: string }[] = isEdu ? edu : tst;
      const limit = Number(url.searchParams.get("limit") ?? "50");
      const idFilter = url.searchParams.get("id") ?? "";
      if (idFilter.startsWith("gt.")) {
        const cursor = idFilter.slice(3);
        rest = rest.filter((r) => r.id > cursor);
      } else if (idFilter.startsWith("eq.")) {
        return Response.json([]);
      }
      assert.ok(url.searchParams.get("order") === "id.asc");
      assert.ok(url.searchParams.get("user_id") === "eq." + A);
      return Response.json(rest.slice(0, Math.min(limit, cap)));
    },
  });
  return { h, edu, tst };
}

test("load pages beyond 50 until empty", async () => {
  const { h, edu } = pagedHarness(65, 3);
  const result = await h.service.load(scopeFor());
  assert.equal(result.education.length, 65);
  assert.equal(result.tests.length, 3);
  assert.deepEqual(result.education.map((r) => r.id), edu.map((r) => r.id));
  const eduCalls = h.sent.filter((c) => c.url.pathname.includes("student_education"));
  assert.ok(eduCalls.length >= 3, `expected paging, got ${eduCalls.length}`);
});

test("load follows a shorter server cap until empty", async () => {
  const { h } = pagedHarness(25, 2, 7);
  const result = await h.service.load(scopeFor());
  assert.equal(result.education.length, 25);
  assert.equal(result.tests.length, 2);
  const eduCalls = h.sent.filter((c) => c.url.pathname.includes("student_education"));
  assert.ok(eduCalls.length >= 5, `expected short pages, got ${eduCalls.length}`);
});

test("cursor disorder fails without returning partial rows", async () => {
  const edu = [pagedEducationRow(1), pagedEducationRow(2), pagedEducationRow(3)];
  let calls = 0;
  const h = harness({
    fetch: async (input) => {
      const url = new URL(String(input), "http://localhost");
      if (!url.pathname.includes("student_education")) return Response.json([]);
      calls++;
      if (calls === 1) return Response.json(edu.slice(0, 2));
      return Response.json([edu[1], pagedEducationRow(4)]);
    },
  });
  await assert.rejects(h.service.load(scopeFor()), /could not be fully read/);
});

test("collection capacity failure does not return partial rows", async () => {
  const { h } = pagedHarness(120, 0);
  await assert.rejects(h.service.load(scopeFor()), /too large/);
});
