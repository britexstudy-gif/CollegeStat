import test from "node:test";
import assert from "node:assert/strict";
import { AccountScope } from "../lib/account-owner";
import {
  createStudentWritingService,
  WritingAccountChangedError,
} from "../services/student-writing";
import type { WritingVersion } from "../lib/student-writing";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID = "11111111-1111-4111-8111-111111111111";
const row: WritingVersion = {
  id: ID,
  user_id: A,
  format: "statement",
  body: "My own draft.",
  created_at: "2026-10-10T04:00:00Z",
};
const draft = { id: ID, format: "statement" as const, body: row.body };
type Deps = Parameters<typeof createStudentWritingService>[0];
function scopeFor() {
  const scope = new AccountScope();
  scope.changeOwner(A);
  return scope;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
function harness(overrides: Partial<Deps> = {}) {
  const sent: { url: URL; init?: RequestInit }[] = [];
  const dispatch =
    overrides.fetch ??
    (async (_input, init) =>
      init?.method === "DELETE"
        ? new Response(null, { status: 204 })
        : Response.json([row]));
  const api = createStudentWritingService({
    url: "https://writing.example.test",
    key: "publishable-test-key",
    session: async () => ({ owner: A, token: "token-A" }),
    ...overrides,
    fetch: async (input, init) => {
      sent.push({ url: new URL(String(input)), init });
      return dispatch(input, init);
    },
  });
  return { api, sent };
}
const auth = (init?: RequestInit) =>
  new Headers(init?.headers).get("authorization");

test("writing loads a bounded deterministic history page for the exact owner and format", async () => {
  const h = harness();
  assert.deepEqual(await h.api.load(scopeFor(), "statement", 20), [row]);
  const request = h.sent[0];
  assert.equal(request.url.pathname, "/rest/v1/writing_draft_versions");
  assert.equal(request.url.searchParams.get("user_id"), "eq." + A);
  assert.equal(request.url.searchParams.get("format"), "eq.statement");
  assert.equal(request.url.searchParams.get("offset"), "20");
  assert.equal(request.url.searchParams.get("limit"), "20");
  assert.equal(
    request.url.searchParams.get("order"),
    "created_at.desc,id.desc",
  );
  assert.equal(auth(request.init), "Bearer token-A");
  assert.ok(request.init?.signal);
});
test("writing dispatch does not bind the browser fetch function to the dependency object", async () => {
  const api = createStudentWritingService({
    url: "https://writing.example.test",
    key: "publishable-test-key",
    session: async () => ({ owner: A, token: "token-A" }),
    fetch: async function (this: unknown) {
      assert.equal(
        this,
        undefined,
        "Native window.fetch rejects a dependency-object receiver",
      );
      return Response.json([row]);
    },
  });
  assert.deepEqual(await api.load(scopeFor(), "statement"), [row]);
});
test("save appends a version with frozen owner, content and id, never an update or client timestamp", async () => {
  const wait = deferred<{ owner: string; token: string } | null>();
  const h = harness({ session: () => wait.promise });
  const input = { ...draft };
  const save = h.api.save(scopeFor(), input);
  input.body = "Later unsaved editing";
  wait.resolve({ owner: A, token: "token-A" });
  assert.deepEqual(await save, row);
  const request = h.sent[0];
  assert.equal(request.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(request.init?.body)), {
    ...draft,
    user_id: A,
  });
  assert.equal(request.url.searchParams.get("on_conflict"), "id");
  assert.equal(
    new Headers(request.init?.headers).get("prefer"),
    "resolution=ignore-duplicates,return=representation",
  );
});
test("retry after a committed save reuses the same id and confirms existing exact contents", async () => {
  const h = harness({
    fetch: async (_input, init) =>
      Response.json(init?.method === "POST" ? [] : [row]),
  });
  assert.deepEqual(await h.api.save(scopeFor(), draft), row);
  assert.equal(h.sent.length, 2);
  assert.equal(h.sent[1].url.searchParams.get("id"), "eq." + ID);
  assert.equal(h.sent[1].url.searchParams.get("user_id"), "eq." + A);
  assert.equal(h.sent[1].url.searchParams.get("limit"), "1");
});
test("an idempotency id can never silently overwrite different saved contents", async () => {
  const h = harness({
    fetch: async (_input, init) =>
      Response.json(
        init?.method === "POST" ? [] : [{ ...row, body: "Another version" }],
      ),
  });
  await assert.rejects(h.api.save(scopeFor(), draft), /could not be confirmed/);
  assert.equal(h.sent.filter((r) => r.init?.method === "POST").length, 1);
});
test("private content or malformed responses from another owner are rejected", async () => {
  for (const response of [
    [{ ...row, user_id: B }],
    [{ ...row, body: "" }],
    [{ ...row, created_at: "not a date" }],
    {},
  ]) {
    const h = harness({ fetch: async () => Response.json(response) });
    await assert.rejects(
      h.api.load(scopeFor(), "statement"),
      /unexpected response/,
    );
  }
  const h = harness({
    fetch: async () => Response.json([{ ...row, format: "motivation" }]),
  });
  await assert.rejects(
    h.api.load(scopeFor(), "statement"),
    /format did not match/,
  );
});
test("invalid or empty writing is refused before touching auth or network", async () => {
  let authCalls = 0;
  const h = harness({
    session: async () => {
      authCalls++;
      return null;
    },
  });
  for (const body of ["", "   ", "a".repeat(20001)])
    await assert.rejects(h.api.save(scopeFor(), { ...draft, body }), /20,000/);
  await assert.rejects(
    h.api.save(scopeFor(), { ...draft, id: "invalid" }),
    /20,000/,
  );
  await assert.rejects(
    h.api.load(scopeFor(), "statement", -1),
    /valid writing/,
  );
  await assert.rejects(
    h.api.load(scopeFor(), "statement", 0.5),
    /valid writing/,
  );
  assert.equal(authCalls, 0);
  assert.equal(h.sent.length, 0);
});
test("empty, invalid and mismatched authenticated owners cannot send writing", async () => {
  const empty = new AccountScope();
  const h = harness();
  await assert.rejects(h.api.save(empty, draft), WritingAccountChangedError);
  const wrongSession = harness({
    session: async () => ({ owner: B, token: "token-B" }),
  });
  await assert.rejects(
    wrongSession.api.save(scopeFor(), draft),
    WritingAccountChangedError,
  );
  assert.equal(h.sent.length + wrongSession.sent.length, 0);
});
test("A to B to A while retrieving session invalidates the save before network dispatch", async () => {
  const wait = deferred<{ owner: string; token: string } | null>();
  const scope = scopeFor();
  const h = harness({ session: () => wait.promise });
  const saving = h.api.save(scope, draft);
  scope.changeOwner(B);
  scope.changeOwner(A);
  wait.resolve({ owner: A, token: "token-A" });
  await assert.rejects(saving, WritingAccountChangedError);
  assert.equal(h.sent.length, 0);
});
test("A to B to A while loading history rejects the stale response", async () => {
  const wait = deferred<Response>();
  const scope = scopeFor();
  const h = harness({ fetch: () => wait.promise });
  const loading = h.api.load(scope, "statement");
  await new Promise((resolve) => setTimeout(resolve, 0));
  scope.changeOwner(B);
  scope.changeOwner(A);
  wait.resolve(Response.json([row]));
  await assert.rejects(loading, WritingAccountChangedError);
  assert.equal(h.sent.length, 1);
});
test("A to B to A while decoding a save response rejects stale success and does not issue retry queries", async () => {
  const wait = deferred<unknown>();
  const scope = scopeFor();
  const response = new Response();
  response.json = () => wait.promise as Promise<WritingVersion[]>;
  const h = harness({ fetch: async () => response });
  const saving = h.api.save(scope, draft);
  await new Promise((resolve) => setTimeout(resolve, 0));
  scope.changeOwner(B);
  scope.changeOwner(A);
  wait.resolve([row]);
  await assert.rejects(saving, WritingAccountChangedError);
  assert.equal(h.sent.length, 1);
});
test("delete targets only the captured owner and selected version with frozen credentials", async () => {
  const h = harness();
  await h.api.remove(scopeFor(), ID);
  assert.equal(h.sent[0].init?.method, "DELETE");
  assert.equal(h.sent[0].url.searchParams.get("user_id"), "eq." + A);
  assert.equal(h.sent[0].url.searchParams.get("id"), "eq." + ID);
  assert.equal(auth(h.sent[0].init), "Bearer token-A");
});
test("stale delete response is rejected even after an account changes back", async () => {
  const wait = deferred<Response>();
  const scope = scopeFor();
  const h = harness({ fetch: () => wait.promise });
  const removing = h.api.remove(scope, ID);
  await new Promise((resolve) => setTimeout(resolve, 0));
  scope.changeOwner(B);
  scope.changeOwner(A);
  wait.resolve(new Response(null, { status: 204 }));
  await assert.rejects(removing, WritingAccountChangedError);
});
test("network failures leave a retryable save error and never report success", async () => {
  const h = harness({
    fetch: async () => {
      throw new Error("Offline");
    },
  });
  await assert.rejects(
    h.api.save(scopeFor(), draft),
    /Keep this draft and retry/,
  );
  assert.equal(h.sent.length, 1);
});
test("denied API operations leave an honest error, without automatic privileged fallback", async () => {
  const h = harness({ fetch: async () => new Response(null, { status: 403 }) });
  await assert.rejects(
    h.api.save(scopeFor(), draft),
    /Keep this draft and retry/,
  );
  assert.equal(h.sent.length, 1);
});
