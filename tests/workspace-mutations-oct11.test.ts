import test from "node:test";
import assert from "node:assert/strict";
import { AccountScope } from "../lib/account-owner";
import {
  createWorkspaceMutationService,
  WorkspaceAccountChangedError,
} from "../services/workspace-mutations";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const ID = "33333333-3333-4333-8333-333333333333";
const UNI = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";
type Deps = Parameters<typeof createWorkspaceMutationService>[0];
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function scopeFor() {
  const scope = new AccountScope();
  scope.changeOwner(A);
  return scope;
}
function harness(overrides: Partial<Deps> = {}) {
  const sent: { url: URL; init?: RequestInit }[] = [];
  let sessions = 0;
  const service = createWorkspaceMutationService({
    url: "https://workspace.example.test",
    key: "public-test",
    randomId: () => ID,
    ...overrides,
    session: async () => {
      sessions++;
      return overrides.session
        ? overrides.session()
        : { owner: A, token: "frozen-A-token" };
    },
    fetch: async function (this: unknown, input, init) {
      assert.equal(this, undefined);
      sent.push({ url: new URL(String(input)), init });
      if (overrides.fetch) return overrides.fetch(input, init);
      if (init?.method === "DELETE")
        return Response.json([{ id: ID, user_id: A }]);
      if (init?.method === "POST")
        return Response.json([JSON.parse(String(init.body))]);
      if (init?.method === "PATCH")
        return Response.json([
          { id: ID, user_id: A, ...JSON.parse(String(init.body)) },
        ]);
      return Response.json([]);
    },
  });
  return { service, sent, sessions: () => sessions };
}

test("workspace inserts freeze the draft, generated ID and credentials before later edits", async () => {
  const lookup = deferred<{ owner: string; token: string }>();
  const h = harness({ session: () => lookup.promise });
  const scope = scopeFor();
  const draft = { title: "Original task", due_at: "2027-01-15" };
  const pending = h.service.write(scope, "user_checklist", draft);
  draft.title = "Later edit";
  draft.due_at = "2027-02-15";
  lookup.resolve({ owner: A, token: "original-token" });
  assert.equal(await pending, ID);
  assert.deepEqual(JSON.parse(String(h.sent[0].init?.body)), {
    id: ID,
    title: "Original task",
    due_at: "2027-01-15",
    user_id: A,
  });
  assert.equal(
    new Headers(h.sent[0].init?.headers).get("authorization"),
    "Bearer original-token",
  );
  assert.equal(h.sent[0].url.searchParams.get("on_conflict"), "id");
});

test("status changes PATCH only explicit fields and preserve an existing deadline and row identity", async () => {
  const stored = {
    id: ID,
    user_id: A,
    university_id: UNI,
    status: "Researching",
    deadline: "2027-02-03",
    created_at: "2026-10-01",
  };
  const h = harness({
    fetch: async (_input, init) => {
      if (init?.method === "PATCH")
        Object.assign(stored, JSON.parse(String(init.body)));
      return Response.json([stored]);
    },
  });
  await h.service.write(
    scopeFor(),
    "saved_universities",
    { university_id: UNI, status: "Applying" },
    "user_id,university_id",
  );
  assert.equal(stored.deadline, "2027-02-03");
  assert.equal(stored.id, ID);
  assert.equal(stored.created_at, "2026-10-01");
  assert.deepEqual(JSON.parse(String(h.sent[1].init?.body)), {
    status: "Applying",
  });
  assert.equal(h.sent[1].url.searchParams.get("id"), "eq." + ID);
  assert.equal(h.sent[1].url.searchParams.get("user_id"), "eq." + A);
});

test("deadline changes preserve the existing application status", async () => {
  const stored = {
    id: ID,
    user_id: A,
    university_id: UNI,
    status: "Submitted",
    deadline: "2027-01-01",
  };
  const h = harness({
    fetch: async (_input, init) => {
      if (init?.method === "PATCH")
        Object.assign(stored, JSON.parse(String(init.body)));
      return Response.json([stored]);
    },
  });
  await h.service.write(scopeFor(), "saved_universities", {
    university_id: UNI,
    deadline: null,
  });
  assert.equal(stored.status, "Submitted");
  assert.equal(stored.deadline, null);
  assert.deepEqual(JSON.parse(String(h.sent[1].init?.body)), {
    deadline: null,
  });
});

test("lost insert confirmations retry the same client UUID without duplicating a checklist row", async () => {
  const stored: Record<string, unknown>[] = [];
  let fail = true;
  const h = harness({
    fetch: async (_input, init) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        if (!stored.some((row) => row.id === body.id)) stored.push(body);
        if (fail) {
          fail = false;
          throw new Error("Response lost");
        }
        return Response.json([]);
      }
      return Response.json(stored);
    },
  });
  const scope = scopeFor();
  const draft = { id: ID, title: "Check language evidence", due_at: null };
  await assert.rejects(
    h.service.write(scope, "user_checklist", draft),
    /Response lost/,
  );
  assert.equal(await h.service.write(scope, "user_checklist", draft), ID);
  assert.equal(stored.length, 1);
  assert.equal(h.sent[2].url.searchParams.get("id"), "eq." + ID);
});

test("a simultaneous unique insert is recovered only by an exact owned receipt, without overwriting newer contents", async () => {
  for (const body of ["Same note", "Newer note"]) {
    let reads = 0;
    const h = harness({
      fetch: async (_input, init) => {
        if (init?.method === "POST") return new Response(null, { status: 409 });
        reads++;
        return Response.json(
          reads === 1
            ? []
            : [{ id: OTHER, user_id: A, university_id: UNI, body }],
        );
      },
    });
    const pending = h.service.write(scopeFor(), "user_notes", {
      university_id: UNI,
      body: "Same note",
    });
    if (body === "Same note") assert.equal(await pending, OTHER);
    else await assert.rejects(pending, /could not be confirmed/);
    assert.equal(h.sent.length, 3);
    assert.ok(h.sent.every((sent) => sent.init?.method !== "PATCH"));
  }
});

test("a reused insert ID cannot silently overwrite different contents", async () => {
  const h = harness({
    fetch: async (_input, init) =>
      Response.json(
        init?.method === "POST"
          ? []
          : [{ id: ID, user_id: A, title: "Other task" }],
      ),
  });
  await assert.rejects(
    h.service.write(scopeFor(), "user_checklist", { id: ID, title: "My task" }),
    /could not be confirmed/,
  );
  assert.equal(h.sent.length, 2);
  assert.ok(h.sent.every((request) => request.init?.method !== "PATCH"));
});

test("task updates validate the returned owner, ID and exact changed field", async () => {
  for (const row of [
    { id: ID, user_id: B, done: true },
    { id: OTHER, user_id: A, done: true },
    { id: ID, user_id: A, done: false },
  ]) {
    const h = harness({ fetch: async () => Response.json([row]) });
    await assert.rejects(
      h.service.updateTask(scopeFor(), ID, { done: true }),
      /could not be confirmed/,
    );
  }
});

test("undefined optional fields are omitted and cannot clear metadata or dispatch an empty patch", async () => {
  const h = harness();
  await h.service.updateTask(scopeFor(), ID, { done: true, due_at: undefined });
  assert.deepEqual(JSON.parse(String(h.sent[0].init?.body)), { done: true });
  assert.throws(() =>
    h.service.updateTask(scopeFor(), ID, { done: undefined }),
  );
  await h.service.write(scopeFor(), "user_checklist", {
    id: ID,
    title: "x",
    due_at: undefined,
  });
  assert.deepEqual(JSON.parse(String(h.sent[1].init?.body)), {
    id: ID,
    user_id: A,
    title: "x",
  });
});

test("read responses from another owner or foreign matching key never reach PATCH", async () => {
  for (const row of [
    { id: ID, user_id: B, university_id: UNI },
    { id: ID, user_id: A, university_id: OTHER },
  ]) {
    const h = harness({ fetch: async () => Response.json([row]) });
    await assert.rejects(
      h.service.write(scopeFor(), "saved_universities", {
        university_id: UNI,
        status: "Applying",
      }),
      /could not be (confirmed|matched)/,
    );
    assert.equal(h.sent.length, 1);
  }
});

test("allowed deletes affect only their exact owner and ID; already removed is harmless", async () => {
  const h = harness();
  await h.service.remove(scopeFor(), "user_lists", ID);
  assert.equal(h.sent[0].url.searchParams.get("user_id"), "eq." + A);
  assert.equal(h.sent[0].url.searchParams.get("id"), "eq." + ID);
  assert.equal(h.sent[0].init?.method, "DELETE");
  const absent = harness({ fetch: async () => Response.json([]) });
  assert.equal(
    await absent.service.remove(scopeFor(), "saved_searches", ID),
    0,
  );
  const wrong = harness({
    fetch: async () => Response.json([{ id: OTHER, user_id: A }]),
  });
  await assert.rejects(
    wrong.service.remove(scopeFor(), "user_checklist", ID),
    /could not be confirmed/,
  );
});

test("tables, ownership columns, invalid dates and malformed task values fail before credentials or requests", () => {
  const h = harness();
  const scope = scopeFor();
  for (const [table, payload, conflict] of [
    ["profiles", { role: "admin" }, undefined],
    ["user_checklist", { title: "x", user_id: B }, undefined],
    ["user_checklist", { title: "x", due_at: "2027-02-30" }, undefined],
    ["user_lists", { name: "x", created_at: "fake" }, undefined],
    [
      "user_list_items",
      { list_id: ID, university_id: UNI, position: -1 },
      undefined,
    ],
    ["saved_universities", { university_id: UNI, status: "Ready" }, undefined],
    ["user_notes", { university_id: UNI, body: "x" }, "id"],
  ] as [string, Record<string, unknown>, string | undefined][])
    assert.throws(() => h.service.write(scope, table, payload, conflict));
  assert.throws(() => h.service.updateTask(scope, ID, { done: "true" }));
  assert.throws(() => h.service.updateTask(scope, ID, { user_id: B }));
  assert.throws(() => h.service.updateTask(scope, ID, { title: "   " }));
  assert.throws(() => h.service.updateTask(scope, ID, { title: "x".repeat(301) }));
  assert.throws(() => h.service.remove(scope, "universities", ID));
  assert.equal(h.sessions(), 0);
  assert.equal(h.sent.length, 0);
});

test("returning to A after a suspended session cannot revive an A to B to A mutation", async () => {
  const session = deferred<{ owner: string; token: string }>();
  const h = harness({ session: () => session.promise });
  const scope = scopeFor();
  const pending = h.service.write(scope, "user_lists", {
    id: ID,
    name: "My list",
  });
  scope.changeOwner(B);
  scope.changeOwner(A);
  await assert.rejects(pending, WorkspaceAccountChangedError);
  session.resolve({ owner: A, token: "new-A" });
  await Promise.resolve();
  assert.equal(h.sent.length, 0);
});

test("in-flight reads settle on owner change even when fetch ignores cancellation", async () => {
  const started = deferred<void>();
  const response = deferred<Response>();
  const scope = scopeFor();
  const h = harness({
    fetch: async () => {
      started.resolve();
      return response.promise;
    },
  });
  const pending = h.service.write(scope, "user_notes", {
    university_id: UNI,
    body: "Private note",
  });
  await started.promise;
  scope.changeOwner(B);
  await assert.rejects(pending, WorkspaceAccountChangedError);
  assert.equal(h.sent[0].init?.signal?.aborted, true);
  response.resolve(Response.json([]));
  await Promise.resolve();
  assert.equal(h.sent.length, 1);
});

test("body parsing stalls settle on owner change and cannot dispatch a later write", async () => {
  const started = deferred<void>();
  const scope = scopeFor();
  const h = harness({
    fetch: async () =>
      ({
        ok: true,
        json: () => {
          started.resolve();
          return new Promise(() => {});
        },
      }) as Response,
  });
  const pending = h.service.write(scope, "saved_universities", {
    university_id: UNI,
    status: "Applying",
  });
  await started.promise;
  scope.changeOwner(B);
  scope.changeOwner(A);
  await assert.rejects(pending, WorkspaceAccountChangedError);
  assert.equal(h.sent.length, 1);
});

for (const stage of ["session", "fetch", "json"] as const)
  test(`${stage} has the same full-operation deadline even when cancellation is ignored`, async () => {
    const stall = () => new Promise<never>(() => {});
    const h = harness({
      timeoutMs: 5,
      ...(stage === "session" ? { session: stall } : {}),
      ...(stage === "fetch" ? { fetch: stall } : {}),
      ...(stage === "json"
        ? {
            fetch: async () =>
              ({ ok: true, json: stall }) as unknown as Response,
          }
        : {}),
    });
    await assert.rejects(
      h.service.updateTask(scopeFor(), ID, { done: true }),
      /timed out/,
    );
    assert.equal(h.sent.length, stage === "session" ? 0 : 1);
    if (h.sent.length) assert.equal(h.sent[0].init?.signal?.aborted, true);
  });

test("malformed or duplicate read receipts never perform an update", async () => {
  for (const body of [
    null,
    {},
    [
      { id: ID, user_id: A },
      { id: OTHER, user_id: A },
    ],
  ]) {
    const h = harness({ fetch: async () => Response.json(body) });
    await assert.rejects(
      h.service.write(scopeFor(), "user_notes", {
        university_id: UNI,
        body: "Draft",
      }),
      /could not be confirmed/,
    );
    assert.equal(h.sent.length, 1);
  }
});

test("mismatched sessions and old captured generations fail without dispatch", async () => {
  const h = harness({ session: async () => ({ owner: B, token: "B-token" }) });
  await assert.rejects(
    h.service.remove(scopeFor(), "comparison_lists", ID),
    WorkspaceAccountChangedError,
  );
  const scoped = scopeFor();
  const old = scoped.capture();
  scoped.changeOwner(B);
  scoped.changeOwner(A);
  await assert.rejects(
    h.service.updateTask(scoped, ID, { done: true }, old),
    WorkspaceAccountChangedError,
  );
  assert.equal(h.sent.length, 0);
});
