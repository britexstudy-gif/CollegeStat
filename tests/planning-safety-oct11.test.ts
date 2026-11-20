import test from "node:test";
import assert from "node:assert/strict";
import { AccountScope } from "../lib/account-owner";
import {
  createSavePlanningTasks,
  PlanningAccountChangedError,
} from "../services/planning";
import { createProfileAccountService } from "../services/profile-account";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
type Deps = Parameters<typeof createSavePlanningTasks>[0];
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
function harness(overrides: Partial<Deps> = {}) {
  const requests: RequestInit[] = [];
  let sessions = 0;
  const save = createSavePlanningTasks({
    url: "https://planning.example.test",
    key: "public-test",
    ...overrides,
    session: async () => {
      sessions++;
      return overrides.session
        ? overrides.session()
        : { owner: A, token: "frozen-A" };
    },
    fetch: async (_input, init) => {
      requests.push(init ?? {});
      return overrides.fetch
        ? overrides.fetch(_input, init)
        : init?.method === "POST"
          ? new Response(null, { status: 201 })
          : Response.json([]);
    },
  });
  return { save, requests, sessions: () => sessions };
}
const steps = [{ title: "Check official deadline", done: false }];
for (const stage of ["session", "fetch", "json", "insert"] as const)
  test(`planning ${stage} stalls share one bounded cancellation deadline`, async () => {
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
      ...(stage === "insert"
        ? {
            fetch: async (_input, init) =>
              init?.method === "POST" ? stall() : Response.json([]),
          }
        : {}),
    });
    await assert.rejects(h.save(scopeFor(), steps), /timed out/);
    assert.equal(
      h.requests.length,
      stage === "session" ? 0 : stage === "insert" ? 2 : 1,
    );
    for (const request of h.requests)
      assert.equal(request.signal?.aborted, true);
  });
test("planning read cancellation settles immediately and A to B to A cannot dispatch an insert", async () => {
  const started = deferred<void>();
  const response = deferred<Response>();
  const scope = scopeFor();
  const h = harness({
    fetch: async () => {
      started.resolve();
      return response.promise;
    },
  });
  const pending = h.save(scope, steps);
  await started.promise;
  scope.changeOwner(B);
  scope.changeOwner(A);
  await assert.rejects(pending, PlanningAccountChangedError);
  response.resolve(Response.json([]));
  await Promise.resolve();
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].signal?.aborted, true);
});
test("planning malformed, unrelated or partial capped receipts cannot create duplicate steps", async () => {
  for (const response of [
    Response.json(null),
    Response.json({ title: "x" }),
    Response.json([{ title: "An unrelated step" }]),
    Response.json([{ title: "Check official deadline" }], {
      headers: { "Content-Range": "0-0/2" },
    }),
    Response.json([], { headers: { "Content-Range": "invalid" } }),
  ]) {
    const h = harness({ fetch: async () => response });
    await assert.rejects(h.save(scopeFor(), steps), /could not be confirmed/);
    assert.equal(h.requests.length, 1);
  }
});
test("invalid runtime task shapes and empty credentials never send a planning mutation", async () => {
  const h = harness();
  await assert.rejects(
    h.save(scopeFor(), [{ title: "x", done: "false" }] as never),
    /valid planning steps/,
  );
  await assert.rejects(
    h.save(scopeFor(), [null] as never),
    /valid planning steps/,
  );
  assert.equal(h.sessions(), 0);
  const noToken = harness({ session: async () => ({ owner: A, token: "" }) });
  await assert.rejects(
    noToken.save(scopeFor(), steps),
    PlanningAccountChangedError,
  );
  assert.equal(noToken.requests.length, 0);
});
test("profile saves only editable columns and rejects oversized or malformed priorities before dispatch", async () => {
  const sent: RequestInit[] = [];
  const service = createProfileAccountService({
    url: "https://profile.example.test",
    key: "public-test",
    session: async () => ({ owner: A, token: "A" }),
    fetch: async (_input, init) => {
      sent.push(init ?? {});
      return Response.json([{ id: A }]);
    },
  });
  await service.save(scopeFor(), {
    display_name: "Student",
    preferences: { field: "Physics" },
    role: "admin",
    id: B,
  } as never);
  assert.deepEqual(JSON.parse(String(sent[0].body)), {
    display_name: "Student",
    preferences: { field: "Physics" },
  });
  assert.throws(() =>
    service.save(scopeFor(), {
      display_name: "x".repeat(121),
      preferences: {},
    }),
  );
  assert.throws(() =>
    service.save(scopeFor(), { display_name: "x", preferences: [] } as never),
  );
  assert.throws(() =>
    service.save(scopeFor(), {
      display_name: "x",
      preferences: { large: "x".repeat(32768) },
    }),
  );
  assert.throws(() =>
    service.save(scopeFor(), {
      display_name: "x",
      preferences: { toJSON: () => null },
    }),
  );
  assert.equal(sent.length, 1);
});
