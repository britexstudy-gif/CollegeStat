import test from "node:test";
import assert from "node:assert/strict";
import { AccountScope } from "../lib/account-owner";
import {
  createProviderAccountService,
  ProviderAccountChangedError,
} from "../services/provider-account";
import { defaultFilters } from "../lib/research";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const U = "33333333-3333-4333-8333-333333333333";
const V = "44444444-4444-4444-8444-444444444444";
const R = "55555555-5555-4555-8555-555555555555";
const T = "66666666-6666-4666-8666-666666666666";
type Deps = Parameters<typeof createProviderAccountService>[0];
function scopeFor() {
  const scope = new AccountScope();
  scope.changeOwner(A);
  return scope;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const profile = {
  id: A,
  display_name: "Student",
  avatar_url: null,
  role: "student",
  preferences: {},
};
function harness(overrides: Partial<Deps> = {}) {
  const requests: { url: URL; init: RequestInit }[] = [];
  let sessions = 0;
  const service = createProviderAccountService({
    url: "https://account.example.test",
    key: "public-key",
    randomId: () => R,
    ...overrides,
    session: async () => {
      sessions++;
      return overrides.session
        ? overrides.session()
        : { owner: A, token: "frozen-A" };
    },
    fetch: async function (this: unknown, input, init) {
      assert.equal(this, undefined);
      requests.push({ url: new URL(String(input)), init: init ?? {} });
      if (overrides.fetch) return overrides.fetch(input, init);
      if (String(input).includes("/profiles?")) return Response.json([profile]);
      if (String(input).includes("/rpc/save_comparison"))
        return Response.json(R);
      if (init?.method === "POST")
        return Response.json([{ id: R, ...JSON.parse(String(init.body)) }]);
      return Response.json([]);
    },
  });
  return { service, requests, sessions: () => sessions };
}

test("saving a bookmark retries its natural unique key without overwriting existing application metadata", async () => {
  const existing = {
    id: R,
    user_id: A,
    university_id: U,
    status: "Applying",
    deadline: "2027-01-15",
  };
  const h = harness({
    fetch: async (_input, init) =>
      init?.method === "POST" ? Response.json([]) : Response.json([existing]),
  });
  await h.service.setSaved(scopeFor(), U, true);
  assert.equal(h.requests.length, 2);
  assert.deepEqual(JSON.parse(String(h.requests[0].init.body)), {
    user_id: A,
    university_id: U,
  });
  assert.equal(
    h.requests[0].url.searchParams.get("on_conflict"),
    "user_id,university_id",
  );
  assert.equal(
    new Headers(h.requests[0].init.headers).get("prefer"),
    "resolution=ignore-duplicates,return=representation",
  );
  assert.equal(h.requests[1].url.searchParams.get("user_id"), "eq." + A);
  assert.equal(existing.status, "Applying");
  assert.equal(existing.deadline, "2027-01-15");
});

test("bookmark removals and scholarships must confirm only the exact initiating owner and selected item", async () => {
  const h = harness({
    fetch: async () =>
      Response.json([{ id: R, user_id: A, scholarship_id: U }]),
  });
  await h.service.setSaved(scopeFor(), U, false, true);
  assert.equal(h.requests[0].url.pathname, "/rest/v1/saved_scholarships");
  assert.equal(h.requests[0].url.searchParams.get("user_id"), "eq." + A);
  assert.equal(h.requests[0].url.searchParams.get("scholarship_id"), "eq." + U);
  assert.equal(h.requests[0].init.method, "DELETE");
  for (const row of [
    { id: R, user_id: B, scholarship_id: U },
    { id: R, user_id: A, scholarship_id: V },
  ]) {
    const bad = harness({ fetch: async () => Response.json([row]) });
    await assert.rejects(
      bad.service.setSaved(scopeFor(), U, false, true),
      /could not be confirmed/,
    );
  }
});

test("a delayed comparison save cannot derive replacement B's owner from a shared SDK session", async () => {
  const session = deferred<{ owner: string; token: string }>();
  const h = harness({ session: () => session.promise });
  const scope = scopeFor();
  const pending = h.service.saveComparison(scope, [U]);
  scope.changeOwner(B);
  scope.changeOwner(A);
  await assert.rejects(pending, ProviderAccountChangedError);
  session.resolve({ owner: A, token: "new-A" });
  assert.equal(h.requests.length, 0);
});

test("comparison input and initiating credentials are frozen before asynchronous work", async () => {
  const session = deferred<{ owner: string; token: string }>();
  const ids = [U];
  const h = harness({ session: () => session.promise });
  const pending = h.service.saveComparison(scopeFor(), ids);
  ids.push(V);
  session.resolve({ owner: A, token: "frozen-A" });
  await pending;
  assert.deepEqual(JSON.parse(String(h.requests[0].init.body)), {
    ids: [U],
    list_name: "My comparison",
  });
  assert.equal(
    new Headers(h.requests[0].init.headers).get("authorization"),
    "Bearer frozen-A",
  );
  const bad = harness({ fetch: async () => Response.json({ id: R }) });
  await assert.rejects(
    bad.service.saveComparison(scopeFor(), [U]),
    /could not be confirmed/,
  );
});

test("invalid selections, IDs and search fields fail before session lookup or dispatch", () => {
  const h = harness();
  for (const ids of [[U, U], ["foreign"], [U, V, R, T, A, B]])
    assert.throws(() => h.service.saveComparison(scopeFor(), ids));
  assert.throws(() => h.service.setSaved(scopeFor(), "foreign", true));
  assert.throws(() =>
    h.service.saveSearch(scopeFor(), "Name", {
      q: "x",
      role: "admin",
    } as never),
  );
  assert.equal(h.sessions(), 0);
  assert.equal(h.requests.length, 0);
});

test("account loading traverses short capped saved pages to an empty final page with frozen headers", async () => {
  const rows = [
    { id: R, user_id: A, university_id: U },
    { id: T, user_id: A, university_id: V },
  ];
  const h = harness({
    fetch: async (input) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/profiles")) return Response.json([profile]);
      if (url.pathname.endsWith("/saved_universities")) {
        const after = url.searchParams.get("id")?.replace(/^gt\./, "");
        return Response.json(
          rows.filter((row) => !after || row.id > after).slice(0, 1),
        );
      }
      return Response.json([]);
    },
  });
  const result = await h.service.load(scopeFor());
  assert.deepEqual(result.saved, [U, V]);
  assert.deepEqual(result.savedScholarships, []);
  assert.equal(result.compare, null);
  assert.equal(
    h.requests.filter((request) =>
      request.url.pathname.endsWith("/saved_universities"),
    ).length,
    3,
  );
  for (const request of h.requests)
    assert.equal(
      new Headers(request.init.headers).get("authorization"),
      "Bearer frozen-A",
    );
});

test("foreign or malformed profile, saved or comparison receipts cannot become a loaded account", async () => {
  for (const [path, body] of [
    ["profiles", [{ ...profile, id: B }]],
    ["profiles", [{ ...profile, role: "owner" }]],
    ["profiles", [{ ...profile, preferences: [] }]],
    ["saved_universities", [{ id: R, user_id: B, university_id: U }]],
    ["saved_universities", [{ id: R, user_id: A, university_id: "invalid" }]],
    ["comparison_lists", [{ id: R, user_id: A, university_ids: [U, U] }]],
  ] as const) {
    const h = harness({
      fetch: async (input) => {
        const pathname = new URL(String(input)).pathname;
        return Response.json(
          pathname.endsWith("/" + path)
            ? body
            : pathname.endsWith("/profiles")
              ? [profile]
              : [],
        );
      },
    });
    await assert.rejects(h.service.load(scopeFor()));
  }
});

for (const stage of ["session", "fetch", "json"] as const)
  test(`provider ${stage} stalls share a full operation deadline and cannot leave busy pending`, async () => {
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
      h.service.saveComparison(scopeFor(), [U]),
      /timed out/,
    );
    if (stage !== "session")
      assert.equal(h.requests[0].init.signal?.aborted, true);
  });

test("owner changes settle a suspended bookmark body even if fetch ignores cancellation", async () => {
  const started = deferred<void>();
  const body = deferred<unknown>();
  const h = harness({
    fetch: async () =>
      ({
        ok: true,
        json: () => {
          started.resolve();
          return body.promise;
        },
      }) as unknown as Response,
  });
  const scope = scopeFor();
  const pending = h.service.setSaved(scope, U, true);
  await started.promise;
  scope.changeOwner(B);
  scope.changeOwner(A);
  await assert.rejects(pending, ProviderAccountChangedError);
  body.resolve([]);
  assert.equal(
    h.requests.length,
    1,
    "no duplicate-confirmation read follows stale body parsing",
  );
});

test("replaced account loads cancel their ignored session lookup before dispatch", async () => {
  const session = deferred<{ owner: string; token: string }>();
  const h = harness({ session: () => session.promise });
  const controller = new AbortController();
  const pending = h.service.load(scopeFor(), undefined, controller.signal);
  controller.abort(new Error("Superseded load"));
  await assert.rejects(pending, /Superseded load/);
  session.resolve({ owner: A, token: "A" });
  assert.equal(h.requests.length, 0);
});

test("a failed account collection cancels sibling requests rather than continuing a partial private load", async () => {
  const h = harness({
    fetch: async (input) =>
      new URL(String(input)).pathname.endsWith("/profiles")
        ? new Response(null, { status: 503 })
        : new Promise(() => {}),
  });
  await assert.rejects(h.service.load(scopeFor()), /could not be confirmed/);
  for (const request of h.requests)
    assert.equal(request.init.signal?.aborted, true);
});

test("a saved search retry uses the same client ID and confirms equivalent JSON regardless of key order", async () => {
  const row = {
    id: R,
    user_id: A,
    name: "Physics",
    filters: Object.fromEntries(Object.entries(defaultFilters).reverse()),
  };
  let inserted = false;
  const h = harness({
    fetch: async (_input, init) => {
      if (init?.method === "POST") {
        if (!inserted) {
          inserted = true;
          throw new Error("Lost response");
        }
        return Response.json([]);
      }
      return Response.json([row]);
    },
  });
  await assert.rejects(
    h.service.saveSearch(scopeFor(), "Physics", {}, R),
    /Lost response/,
  );
  await h.service.saveSearch(scopeFor(), "Physics", {}, R);
  assert.equal(
    h.requests.filter((request) => request.init.method === "POST").length,
    2,
  );
  for (const request of h.requests.filter(
    (request) => request.init.method === "POST",
  ))
    assert.equal(JSON.parse(String(request.init.body)).id, R);
  row.name = "Different draft";
  await assert.rejects(
    h.service.saveSearch(scopeFor(), "Physics", {}, R),
    /could not be confirmed/,
  );
});

test("history recording freezes the owner and updates only the selected institution's viewed time", async () => {
  const h = harness();
  await h.service.recordView(scopeFor(), U);
  const body = JSON.parse(String(h.requests[0].init.body));
  assert.equal(body.user_id, A);
  assert.equal(body.university_id, U);
  assert.ok(Number.isFinite(Date.parse(body.viewed_at)));
  assert.deepEqual(Object.keys(body).sort(), [
    "university_id",
    "user_id",
    "viewed_at",
  ]);
  assert.equal(
    h.requests[0].url.searchParams.get("on_conflict"),
    "user_id,university_id",
  );
});
