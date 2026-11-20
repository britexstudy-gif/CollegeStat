import test from "node:test";
import assert from "node:assert/strict";
import { AccountScope } from "../lib/account-owner";
import {
  createSavePlanningTasks,
  PlanningAccountChangedError,
} from "../services/planning";

type PlanningDependencies = Parameters<typeof createSavePlanningTasks>[0];
type Task = { title: string; done: boolean };
type SentRequest = { url: URL; init: RequestInit | undefined };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function scopeFor(owner = "A") {
  const scope = new AccountScope();
  scope.changeOwner(owner);
  return scope;
}

function harness(overrides: Partial<PlanningDependencies> = {}) {
  const sent: SentRequest[] = [];
  let sessionCalls = 0;
  const session =
    overrides.session ?? (async () => ({ owner: "A", token: "A-token" }));
  const dispatch =
    overrides.fetch ??
    (async (_input, init) =>
      init?.method === "POST"
        ? new Response(null, { status: 201 })
        : Response.json([]));
  const save = createSavePlanningTasks({
    url: "https://planning.example.test",
    key: "public-test-key",
    session: () => {
      sessionCalls++;
      return session();
    },
    fetch: async (input, init) => {
      sent.push({ url: new URL(String(input)), init });
      return dispatch(input, init);
    },
  });
  return { save, sent, sessionCalls: () => sessionCalls };
}

const task = (title = "Check course deadline"): Task => ({
  title,
  done: false,
});
const posted = (request: SentRequest) =>
  JSON.parse(String(request.init?.body)) as Array<Task & { user_id: string }>;
const authorization = (request: SentRequest) =>
  new Headers(request.init?.headers).get("authorization");

test("planning detaches native-style fetch from its dependency object for reads and saves", async () => {
  const requests: RequestInit[] = [];
  const save = createSavePlanningTasks({
    url: "https://planning.example.test",
    key: "public-test-key",
    session: async () => ({ owner: "A", token: "A-token" }),
    fetch: async function (this: unknown, _input, init) {
      assert.equal(
        this,
        undefined,
        "browser fetch rejects an arbitrary object receiver",
      );
      requests.push(init ?? {});
      return init?.method === "POST"
        ? new Response(null, { status: 201 })
        : Response.json([]);
    },
  });
  assert.equal(await save(scopeFor(), [task()]), 1);
  assert.equal(requests.length, 2);
});

test("planning saves trim and deduplicate submitted steps and skip titles already saved", async () => {
  const h = harness({
    fetch: async (_input, init) =>
      init?.method === "POST"
        ? new Response(null, { status: 201 })
        : Response.json([{ title: "Already in plan" }]),
  });
  assert.equal(
    await h.save(scopeFor(), [
      { title: "  New step  ", done: false },
      { title: "New step", done: true },
      task("Already in plan"),
      task("Second new step"),
    ]),
    2,
  );
  assert.equal(h.sent.length, 2);
  assert.equal(h.sent[0].url.pathname, "/rest/v1/user_checklist");
  assert.equal(h.sent[0].url.searchParams.get("user_id"), "eq.A");
  assert.equal(h.sent[0].url.searchParams.get("select"), "title");
  assert.equal(h.sent[0].url.searchParams.get("limit"), "20");
  assert.equal(
    h.sent[0].url.searchParams.get("title"),
    'in.("New step","Already in plan","Second new step")',
  );
  assert.deepEqual(posted(h.sent[1]), [
    { title: "New step", done: true, user_id: "A" },
    { title: "Second new step", done: false, user_id: "A" },
  ]);
  assert.equal(
    new Headers(h.sent[1].init?.headers).get("prefer"),
    "return=minimal",
  );
});

test("saving an existing plan returns zero and sends no mutation", async () => {
  const h = harness({
    fetch: async () => Response.json([{ title: "Check course deadline" }]),
  });
  assert.equal(
    await h.save(scopeFor(), [task(), task("  Check course deadline  ")]),
    0,
  );
  assert.equal(h.sent.length, 1);
  assert.notEqual(h.sent[0].init?.method, "POST");
});

test("repeating a saved rehearsal does not create duplicate checklist rows", async () => {
  const rows: Array<Task & { user_id: string }> = [];
  const h = harness({
    fetch: async (_input, init) => {
      if (init?.method === "POST") {
        rows.push(...(JSON.parse(String(init.body)) as typeof rows));
        return new Response(null, { status: 201 });
      }
      return Response.json(rows.map(({ title }) => ({ title })));
    },
  });
  const scope = scopeFor();
  assert.equal(
    await h.save(scope, [task("Check qualification"), task("Check language")]),
    2,
  );
  assert.equal(
    await h.save(scope, [task("Check qualification"), task("Check language")]),
    0,
  );
  assert.equal(rows.length, 2);
  assert.equal(
    h.sent.filter((request) => request.init?.method === "POST").length,
    1,
  );
});

test("title filters escape quotes, commas and backslashes without changing saved text", async () => {
  const title = 'Check "portal", transcript \\ route';
  const h = harness();
  assert.equal(await h.save(scopeFor(), [task(title)]), 1);
  assert.equal(
    h.sent[0].url.searchParams.get("title"),
    'in.("Check \\"portal\\", transcript \\\\ route")',
  );
  assert.equal(posted(h.sent[1])[0].title, title);
});

test("invalid or empty planning steps fail before session lookup or network dispatch", async () => {
  for (const tasks of [
    [],
    [task("   ")],
    Array.from({ length: 21 }, (_, index) => task(`Step ${index}`)),
  ]) {
    const h = harness();
    await assert.rejects(
      h.save(scopeFor(), tasks),
      /1–20 valid planning steps/,
    );
    assert.equal(h.sessionCalls(), 0);
    assert.equal(h.sent.length, 0);
  }
});

test("planning title validation respects the checklist table's 300-character limit", async () => {
  const rejected = harness();
  await assert.rejects(
    rejected.save(scopeFor(), [task("x".repeat(301))]),
    /valid planning steps/,
  );
  assert.equal(rejected.sessionCalls(), 0);
  assert.equal(rejected.sent.length, 0);
  const accepted = harness();
  assert.equal(await accepted.save(scopeFor(), [task("x".repeat(300))]), 1);
  assert.equal(posted(accepted.sent[1])[0].title.length, 300);
});

test("signed-out planning context fails before session lookup", async () => {
  const h = harness();
  await assert.rejects(
    h.save(new AccountScope(), [task()]),
    PlanningAccountChangedError,
  );
  assert.equal(h.sessionCalls(), 0);
  assert.equal(h.sent.length, 0);
});

test("an A to B switch during suspended session lookup cannot dispatch A's steps as B", async () => {
  const lookup = deferred<{ owner: string; token: string }>();
  const h = harness({ session: () => lookup.promise });
  const scope = scopeFor();
  const pending = h.save(scope, [task("A's preparation step")]);
  scope.changeOwner("B");
  lookup.resolve({ owner: "B", token: "B-token" });
  await assert.rejects(pending, PlanningAccountChangedError);
  assert.equal(h.sent.length, 0);
});

test("mismatched or missing sessions fail closed even before an account event", async () => {
  for (const session of [null, { owner: "B", token: "B-token" }]) {
    const h = harness({ session: async () => session });
    await assert.rejects(
      h.save(scopeFor(), [task()]),
      PlanningAccountChangedError,
    );
    assert.equal(h.sent.length, 0);
  }
});

test("returning to A after A to B to A cannot revive a suspended planning save", async () => {
  const lookup = deferred<{ owner: string; token: string }>();
  const h = harness({ session: () => lookup.promise });
  const scope = scopeFor();
  const pending = h.save(scope, [task()]);
  scope.changeOwner("B");
  scope.changeOwner("A");
  lookup.resolve({ owner: "A", token: "A-new-token" });
  await assert.rejects(pending, PlanningAccountChangedError);
  assert.equal(h.sent.length, 0);
});

test("an account switch while loading existing steps prevents the subsequent insert", async () => {
  const dispatched = deferred<void>();
  const response = deferred<Response>();
  const h = harness({
    fetch: () => {
      dispatched.resolve();
      return response.promise;
    },
  });
  const scope = scopeFor();
  const pending = h.save(scope, [task()]);
  await dispatched.promise;
  scope.changeOwner("B");
  response.resolve(Response.json([]));
  await assert.rejects(pending, PlanningAccountChangedError);
  assert.equal(h.sent.length, 1);
  assert.equal(authorization(h.sent[0]), "Bearer A-token");
});

test("an account switch while existing steps are being decoded prevents the subsequent insert", async () => {
  const parsing = deferred<void>();
  const decoded = deferred<Array<{ title: string }>>();
  const h = harness({
    fetch: async () =>
      ({
        ok: true,
        json: () => {
          parsing.resolve();
          return decoded.promise;
        },
      }) as Response,
  });
  const scope = scopeFor();
  const pending = h.save(scope, [task()]);
  await parsing.promise;
  scope.changeOwner("B");
  decoded.resolve([]);
  await assert.rejects(pending, PlanningAccountChangedError);
  assert.equal(h.sent.length, 1);
});

test("a switched account cannot consume an accepted response for A's in-flight save", async () => {
  const postedRequest = deferred<void>();
  const response = deferred<Response>();
  const h = harness({
    fetch: async (_input, init) => {
      if (init?.method !== "POST") return Response.json([]);
      postedRequest.resolve();
      return response.promise;
    },
  });
  const scope = scopeFor();
  const pending = h.save(scope, [task("A's step")]);
  await postedRequest.promise;
  scope.changeOwner("B");
  response.resolve(new Response(null, { status: 201 }));
  await assert.rejects(pending, PlanningAccountChangedError);
  assert.equal(h.sent.length, 2);
  assert.equal(authorization(h.sent[1]), "Bearer A-token");
  assert.equal(posted(h.sent[1])[0].user_id, "A");
});

test("planning pins the initiating token across both requests and freezes the submitted draft", async () => {
  const lookup = deferred<{ owner: string; token: string }>();
  const availableSession = { owner: "A", token: "A-token" };
  const scope = scopeFor();
  const h = harness({
    session: () => lookup.promise,
    fetch: async (_input, init) => {
      if (init?.method === "POST") return new Response(null, { status: 201 });
      availableSession.owner = "B";
      availableSession.token = "B-token";
      return Response.json([]);
    },
  });
  const draft = [task("A's original step")];
  const pending = h.save(scope, draft);
  draft[0].title = "A's later edit";
  draft[0].done = true;
  lookup.resolve(availableSession);
  assert.equal(await pending, 1);
  assert.equal(h.sessionCalls(), 1);
  assert.deepEqual(h.sent.map(authorization), [
    "Bearer A-token",
    "Bearer A-token",
  ]);
  assert.deepEqual(posted(h.sent[1]), [
    { title: "A's original step", done: false, user_id: "A" },
  ]);
});

test("same-account token refresh leaves the pending plan valid", async () => {
  const lookup = deferred<{ owner: string; token: string }>();
  const h = harness({ session: () => lookup.promise });
  const scope = scopeFor();
  const pending = h.save(scope, [task()]);
  assert.equal(scope.changeOwner("A"), false);
  lookup.resolve({ owner: "A", token: "A-refreshed-token" });
  assert.equal(await pending, 1);
  assert.deepEqual(h.sent.map(authorization), [
    "Bearer A-refreshed-token",
    "Bearer A-refreshed-token",
  ]);
});

test("failed reads never dispatch an insert and failed inserts cannot report success", async () => {
  const readFailure = harness({
    fetch: async () => new Response(null, { status: 500 }),
  });
  await assert.rejects(
    readFailure.save(scopeFor(), [task()]),
    /plan could not be loaded/,
  );
  assert.equal(readFailure.sent.length, 1);
  const insertFailure = harness({
    fetch: async (_input, init) =>
      init?.method === "POST"
        ? new Response(null, { status: 500 })
        : Response.json([]),
  });
  await assert.rejects(
    insertFailure.save(scopeFor(), [task()]),
    /steps could not be saved/,
  );
  assert.equal(insertFailure.sent.length, 2);
});
