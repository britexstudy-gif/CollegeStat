import test from "node:test";
import assert from "node:assert/strict";
import { AccountScope, type AccountOwner } from "../lib/account-owner";
import {
  createStaffFetch,
  StaffAccountChangedError,
  type StaffRequestDependencies,
} from "../services/admin-client";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

const session = (owner: string) => ({
  data: { session: { access_token: owner + "-token", user: { id: owner } } },
});
const scopeFor = (owner = "A") => {
  const scope = new AccountScope();
  scope.changeOwner(owner);
  return scope;
};

function harness(overrides: Partial<StaffRequestDependencies> = {}) {
  const sent: { path: RequestInfo | URL; init?: RequestInit }[] = [];
  let accountChanged: ((owner: AccountOwner) => void) | undefined;
  let removed = 0;
  const request = createStaffFetch({
    getSession: async () => session("A"),
    fetch: async (path, init) => {
      sent.push({ path, init });
      return Response.json({ saved: true });
    },
    subscribeAccountChanges: (listener) => {
      accountChanged = listener;
      return () => {
        removed++;
        accountChanged = undefined;
      };
    },
    ...overrides,
  });
  return {
    request,
    sent,
    notify: (owner: AccountOwner) => accountChanged?.(owner),
    removed: () => removed,
  };
}

test("a matched initiating account sends its frozen draft and access token", async () => {
  const lookup = deferred<ReturnType<typeof session>>();
  const h = harness({ getSession: () => lookup.promise });
  const scope = scopeFor();
  const draft = { action: "save", record: { name: "A's draft" } };
  const pending = h.request("/api/admin", draft, undefined, { scope });
  draft.record.name = "A later edit";
  lookup.resolve(session("A"));
  assert.deepEqual(await pending, { saved: true });
  assert.equal(h.sent.length, 1);
  assert.equal(
    h.sent[0].init?.headers &&
      new Headers(h.sent[0].init.headers).get("authorization"),
    "Bearer A-token",
  );
  assert.deepEqual(JSON.parse(String(h.sent[0].init?.body)), {
    action: "save",
    record: { name: "A's draft" },
  });
  assert.equal(h.removed(), 1);
});

test("an A to B switch during suspended session lookup never dispatches A's mutation as B", async () => {
  const lookup = deferred<ReturnType<typeof session>>();
  const h = harness({ getSession: () => lookup.promise });
  const scope = scopeFor();
  const pending = h.request(
    "/api/admin",
    { action: "review", id: "A-record" },
    undefined,
    { scope },
  );
  scope.changeOwner("B");
  lookup.resolve(session("B"));
  await assert.rejects(pending, StaffAccountChangedError);
  assert.equal(h.sent.length, 0);
  assert.equal(h.removed(), 1);
});

test("a mismatched session owner fails closed even before the scope receives its auth event", async () => {
  const h = harness({ getSession: async () => session("B") });
  await assert.rejects(
    h.request("/api/admin", { action: "save" }, undefined, {
      scope: scopeFor(),
    }),
    StaffAccountChangedError,
  );
  assert.equal(h.sent.length, 0);
});

test("returning to A does not revive a token captured before A to B to A", async () => {
  const scope = scopeFor();
  const token = scope.capture();
  scope.changeOwner("B");
  scope.changeOwner("A");
  let lookups = 0;
  const h = harness({
    getSession: async () => {
      lookups++;
      return session("A");
    },
  });
  await assert.rejects(
    h.request("/api/admin", { action: "save" }, undefined, { scope, token }),
    StaffAccountChangedError,
  );
  assert.equal(lookups, 0);
  assert.equal(h.sent.length, 0);
});

test("an old account response is rejected when ownership changes while its JSON is suspended", async () => {
  const decoded = deferred<unknown>();
  const parsing = deferred<void>();
  let networkSignal: AbortSignal | undefined;
  const scope = scopeFor();
  const h = harness({
    fetch: async (_path, init) => {
      networkSignal = init?.signal ?? undefined;
      return {
        ok: true,
        status: 200,
        json: () => {
          parsing.resolve();
          return decoded.promise;
        },
      } as Response;
    },
  });
  const pending = h.request(
    "/api/staff/mcp",
    { method: "tools/call" },
    undefined,
    { scope },
  );
  await parsing.promise;
  scope.changeOwner("B");
  decoded.resolve({ private_result: "A's evidence" });
  await assert.rejects(pending, StaffAccountChangedError);
  assert.equal(networkSignal?.aborted, true);
});

test("an auth transition aborts a pending request without waiting for the network", async () => {
  const dispatched = deferred<void>();
  const response = deferred<Response>();
  let networkSignal: AbortSignal | undefined;
  const scope = scopeFor();
  const h = harness({
    fetch: (_path, init) => {
      networkSignal = init?.signal ?? undefined;
      dispatched.resolve();
      return response.promise;
    },
  });
  const pending = h.request("/api/admin", { action: "import" }, undefined, {
    scope,
  });
  await dispatched.promise;
  scope.changeOwner("B");
  h.notify("B");
  await assert.rejects(pending, StaffAccountChangedError);
  assert.equal(networkSignal?.aborted, true);
  assert.equal(h.removed(), 1);
  response.resolve(Response.json({ saved: true }));
});

test("same-account token refresh does not cancel a valid pending request", async () => {
  const lookup = deferred<ReturnType<typeof session>>();
  const h = harness({ getSession: () => lookup.promise });
  const scope = scopeFor();
  const pending = h.request(
    "/api/staff/mcp",
    { method: "initialize" },
    undefined,
    { scope },
  );
  assert.equal(scope.changeOwner("A"), false);
  h.notify("A");
  lookup.resolve(session("A"));
  assert.deepEqual(await pending, { saved: true });
  assert.equal(h.sent.length, 1);
});

test("missing context and signed-out context cannot dispatch staff work", async () => {
  let lookups = 0;
  const h = harness({
    getSession: async () => {
      lookups++;
      return session("A");
    },
  });
  await assert.rejects(
    h.request("/api/admin", { action: "save" }),
    /account context/,
  );
  await assert.rejects(
    h.request("/api/admin", { action: "save" }, undefined, {
      scope: new AccountScope(),
    }),
    /Sign in required/,
  );
  assert.equal(lookups, 0);
  assert.equal(h.sent.length, 0);
});

test("abort during session restoration ends promptly and prevents subsequent dispatch", async () => {
  const lookup = deferred<ReturnType<typeof session>>();
  const controller = new AbortController();
  const h = harness({ getSession: () => lookup.promise });
  const pending = h.request(
    "/api/admin",
    { action: "save" },
    controller.signal,
    { scope: scopeFor() },
  );
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  lookup.resolve(session("A"));
  await Promise.resolve();
  assert.equal(h.sent.length, 0);
  assert.equal(h.removed(), 1);
});

test("a timeout bounds hung session lookup and response parsing", async () => {
  const lookup = deferred<ReturnType<typeof session>>();
  const beforeDispatch = harness({ getSession: () => lookup.promise });
  await assert.rejects(
    beforeDispatch.request("/api/admin", { action: "save" }, undefined, {
      scope: scopeFor(),
      timeoutMs: 20,
    }),
    /timed out/,
  );
  assert.equal(beforeDispatch.sent.length, 0);
  lookup.resolve(session("A"));
  let networkSignal: AbortSignal | undefined;
  const decoded = deferred<unknown>();
  const afterDispatch = harness({
    fetch: async (_path, init) => {
      networkSignal = init?.signal ?? undefined;
      return { ok: true, status: 200, json: () => decoded.promise } as Response;
    },
  });
  await assert.rejects(
    afterDispatch.request("/api/admin", { action: "save" }, undefined, {
      scope: scopeFor(),
      timeoutMs: 20,
    }),
    /timed out/,
  );
  assert.equal(networkSignal?.aborted, true);
  decoded.resolve({ saved: true });
});

test("an accepted response still cannot complete work after its initiating account signs out", async () => {
  const response = deferred<Response>();
  const dispatched = deferred<void>();
  const scope = scopeFor();
  const h = harness({
    fetch: () => {
      dispatched.resolve();
      return response.promise;
    },
  });
  const pending = h.request(
    "/api/staff/mcp",
    { method: "notifications/initialized" },
    undefined,
    { scope },
  );
  await dispatched.promise;
  scope.changeOwner(null);
  response.resolve(new Response(null, { status: 202 }));
  await assert.rejects(pending, StaffAccountChangedError);
});
