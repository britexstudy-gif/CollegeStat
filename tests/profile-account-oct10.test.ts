import test from "node:test";
import assert from "node:assert/strict";
import { AccountScope } from "../lib/account-owner";
import {
  createProfileAccountService,
  ProfileAccountChangedError,
} from "../services/profile-account";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
type Session = { owner: string; token: string } | null;
type Dependencies = Parameters<typeof createProfileAccountService>[0];
type Sent = { url: URL; init: RequestInit | undefined };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
function scopeFor(owner: string | null = A) {
  const scope = new AccountScope();
  scope.changeOwner(owner);
  return scope;
}
function harness(overrides: Partial<Dependencies> = {}) {
  const sent: Sent[] = [];
  const service = createProfileAccountService({
    url: "https://profile.example.test",
    key: "public-test-key",
    session: async () => ({ owner: A, token: "A-frozen-token" }),
    ...overrides,
    fetch: async function (this: unknown, input, init) {
      assert.equal(
        this,
        undefined,
        "native browser fetch must have no arbitrary receiver",
      );
      sent.push({ url: new URL(String(input), "http://localhost"), init });
      return overrides.fetch
        ? overrides.fetch(input, init)
        : String(input) === "/api/account"
          ? Response.json({ deleted: true })
          : init?.method === "DELETE"
            ? new Response(null, { status: 204 })
            : Response.json([{ id: A }]);
    },
  });
  return { service, sent };
}
const preferences = () => ({
  display_name: "Student A",
  preferences: { field: "Physics", countries: ["GB"] },
});

test("deletion waits for and binds the initiating owner, without a shared sign-out side effect", async () => {
  const h = harness();
  await h.service.remove(scopeFor());
  assert.equal(h.sent.length, 1);
  assert.equal(h.sent[0].url.pathname, "/api/account");
  assert.equal(h.sent[0].init?.method, "DELETE");
  assert.equal(
    new Headers(h.sent[0].init?.headers).get("authorization"),
    "Bearer A-frozen-token",
  );
  assert.equal(new Headers(h.sent[0].init?.headers).get("apikey"), null);
  assert.equal(h.sent[0].init?.body, undefined);
});

test("a delayed deletion session lookup cannot consume replacement account B", async () => {
  const session = deferred<Session>();
  const h = harness({ session: () => session.promise });
  const scope = scopeFor();
  const pending = h.service.remove(scope);
  scope.changeOwner(B);
  await assert.rejects(pending, ProfileAccountChangedError);
  session.resolve({ owner: B, token: "B-token" });
  await Promise.resolve();
  assert.equal(h.sent.length, 0);
});

test("A to B to A does not revive a pending deletion or send its old token", async () => {
  const session = deferred<Session>();
  const h = harness({ session: () => session.promise });
  const scope = scopeFor();
  const pending = h.service.remove(scope);
  scope.changeOwner(B);
  scope.changeOwner(A);
  session.resolve({ owner: A, token: "new-A-token" });
  await assert.rejects(pending, ProfileAccountChangedError);
  assert.equal(h.sent.length, 0);
});

test("a mismatched returned session is rejected even before React observes the auth change", async () => {
  const h = harness({ session: async () => ({ owner: B, token: "B-token" }) });
  await assert.rejects(
    h.service.remove(scopeFor()),
    ProfileAccountChangedError,
  );
  assert.equal(h.sent.length, 0);
});

test("an owner switch while deletion is in flight aborts the request and rejects late success", async () => {
  const response = deferred<Response>();
  const started = deferred<void>();
  const h = harness({
    fetch: async () => {
      started.resolve();
      return response.promise;
    },
  });
  const scope = scopeFor();
  const pending = h.service.remove(scope);
  await started.promise;
  scope.changeOwner(B);
  await assert.rejects(pending, ProfileAccountChangedError);
  assert.equal(h.sent[0].init?.signal?.aborted, true);
  response.resolve(Response.json({ deleted: true }));
  assert.equal(
    new Headers(h.sent[0].init?.headers).get("authorization"),
    "Bearer A-frozen-token",
  );
  assert.equal(
    h.sent.length,
    1,
    "no logout or replacement-owner request follows stale deletion",
  );
});

test("deletion requires an explicit confirmation response", async () => {
  const h = harness({ fetch: async () => Response.json({ deleted: false }) });
  await assert.rejects(h.service.remove(scopeFor()), /could not be confirmed/);
});

test("saving freezes its body before session lookup and uses the same owner in its filter", async () => {
  const session = deferred<Session>();
  const input = preferences();
  const h = harness({ session: () => session.promise });
  const pending = h.service.save(scopeFor(), input);
  input.display_name = "Later edit";
  input.preferences.countries.push("CA");
  session.resolve({ owner: A, token: "A-frozen-token" });
  await pending;
  assert.deepEqual(JSON.parse(String(h.sent[0].init?.body)), preferences());
  assert.equal(h.sent[0].url.searchParams.get("id"), "eq." + A);
  assert.equal(h.sent[0].url.searchParams.get("select"), "id");
  assert.equal(h.sent[0].init?.method, "PATCH");
});

test("preference writes must confirm the initiating row rather than accepting a different account", async () => {
  const h = harness({ fetch: async () => Response.json([{ id: B }]) });
  await assert.rejects(
    h.service.save(scopeFor(), preferences()),
    /could not be confirmed/,
  );
});

for (const operation of ["save", "preferences", "history"] as const) {
  test(`${operation} cannot start for B after delayed session lookup or revive after A to B to A`, async () => {
    const session = deferred<Session>();
    const h = harness({ session: () => session.promise });
    const scope = scopeFor();
    const pending =
      operation === "save"
        ? h.service.save(scope, preferences())
        : h.service.clear(scope, operation === "history");
    scope.changeOwner(B);
    scope.changeOwner(A);
    session.resolve({ owner: A, token: "new-A-token" });
    await assert.rejects(pending, ProfileAccountChangedError);
    assert.equal(h.sent.length, 0);
  });
}

test("clearing history and preferences affects only the bound owner's records", async () => {
  const h = harness();
  const scope = scopeFor();
  await h.service.clear(scope, true);
  await h.service.clear(scope, false);
  assert.equal(h.sent[0].url.pathname, "/rest/v1/research_history");
  assert.equal(h.sent[0].url.searchParams.get("user_id"), "eq." + A);
  assert.equal(h.sent[0].init?.method, "DELETE");
  assert.equal(h.sent[1].url.searchParams.get("id"), "eq." + A);
  assert.deepEqual(JSON.parse(String(h.sent[1].init?.body)), {
    preferences: {},
  });
});

test("stale mutation results cannot be accepted after returning to the same account", async () => {
  const response = deferred<Response>();
  const started = deferred<void>();
  const h = harness({
    fetch: async () => {
      started.resolve();
      return response.promise;
    },
  });
  const scope = scopeFor();
  const pending = h.service.save(scope, preferences());
  await started.promise;
  scope.changeOwner(B);
  scope.changeOwner(A);
  response.resolve(Response.json([{ id: A }]));
  await assert.rejects(pending, ProfileAccountChangedError);
});

test("an anonymous or stale initiating token cannot start a profile mutation", async () => {
  const h = harness();
  await assert.rejects(
    h.service.remove(scopeFor(null)),
    ProfileAccountChangedError,
  );
  const scope = scopeFor();
  const old = scope.capture();
  scope.changeOwner(B);
  scope.changeOwner(A);
  await assert.rejects(
    h.service.clear(scope, false, old),
    ProfileAccountChangedError,
  );
  assert.equal(h.sent.length, 0);
});

test("session and network stalls are bounded rather than leaving a destructive control pending", async () => {
  const h = harness({ timeoutMs: 5, session: () => new Promise(() => {}) });
  await assert.rejects(h.service.remove(scopeFor()), /timed out/);
  assert.equal(h.sent.length, 0);
});

test("scope subscriptions invalidate work synchronously, survive a failing listener and unsubscribe", () => {
  const scope = scopeFor();
  const changes: string[] = [];
  const remove = scope.subscribe((token) => {
    changes.push(String(token.owner));
  });
  scope.subscribe(() => {
    throw new Error("Consumer already cancelled");
  });
  assert.equal(scope.changeOwner(B), true);
  assert.deepEqual(changes, [B]);
  assert.equal(scope.changeOwner(B), false);
  assert.deepEqual(
    changes,
    [B],
    "same-owner token refresh does not invalidate work",
  );
  remove();
  scope.changeOwner(A);
  assert.deepEqual(changes, [B]);
});
