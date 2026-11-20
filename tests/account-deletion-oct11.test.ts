import test from "node:test";
import assert from "node:assert/strict";
import { createAccountDeletionHandler } from "../server/account-deletion";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
type Deps = Parameters<typeof createAccountDeletionHandler>[0];
function request(signal?: AbortSignal, body?: string) {
  return new Request("https://college.example.test/api/account", {
    method: "DELETE",
    headers: {
      Origin: "https://college.example.test",
      Authorization: "Bearer verified-A",
    },
    signal,
    body,
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function harness(overrides: Partial<Deps> = {}) {
  const calls: string[] = [];
  const service = {
    consumeLimit: async (owner: string) => {
      calls.push("limit:" + owner);
      return { data: true, error: null };
    },
    revokeSessions: async (token: string) => {
      calls.push("revoke:" + token);
      return { error: null };
    },
    deleteUser: async (owner: string) => {
      calls.push("delete:" + owner);
      return { error: null };
    },
  };
  const handler = createAccountDeletionHandler({
    sameOrigin: () => true,
    authenticate: async () => {
      calls.push("authenticate");
      return { user: { id: A }, token: "verified-A" };
    },
    service: () => service,
    failure: () => Response.json({ error: "Generic failure" }, { status: 500 }),
    ...overrides,
  });
  return { handler, calls, service };
}

test("deletion ignores caller-supplied identities and revokes verified owner sessions before deleting", async () => {
  const h = harness();
  const response = await h.handler(
    request(undefined, JSON.stringify({ user_id: B, role: "admin" })),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { deleted: true });
  assert.deepEqual(h.calls, [
    "authenticate",
    "limit:" + A,
    "revoke:verified-A",
    "delete:" + A,
  ]);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("wrong origin or absent bearer cannot authenticate, rate limit or delete", async () => {
  const blocked = harness({ sameOrigin: () => false });
  assert.equal((await blocked.handler(request())).status, 403);
  assert.equal(blocked.calls.length, 0);
  const missing = harness();
  assert.equal(
    (
      await missing.handler(
        new Request("https://college.example.test/api/account", {
          method: "DELETE",
        }),
      )
    ).status,
    401,
  );
  assert.equal(missing.calls.length, 0);
});

test("malformed or mismatched authenticated identities fail before the privileged service", async () => {
  for (const auth of [
    null,
    { user: { id: "not-a-uuid" }, token: "verified-A" },
    { user: { id: A }, token: "other-token" },
  ]) {
    const h = harness({ authenticate: async () => auth });
    assert.equal((await h.handler(request())).status, 401);
    assert.equal(h.calls.length, 0);
  }
});

test("rate-limit exhaustion or malformed/error receipts never revoke or delete", async () => {
  for (const [data, error, status] of [
    [false, null, 429],
    [true, new Error("unavailable"), 503],
    ["true", null, 503],
    [null, null, 503],
  ] as const) {
    let revocations = 0;
    let deletions = 0;
    const h = harness({
      service: () => ({
        consumeLimit: async () => ({ data, error }),
        revokeSessions: async () => {
          revocations++;
          return { error: null };
        },
        deleteUser: async () => {
          deletions++;
          return { error: null };
        },
      }),
    });
    const response = await h.handler(request());
    assert.equal(response.status, status);
    assert.equal(revocations, 0);
    assert.equal(deletions, 0);
    if (status === 429)
      assert.equal(response.headers.get("retry-after"), "3600");
  }
});

test("a failed session revocation preserves the account and never confirms deletion", async () => {
  let deleted = false;
  const h = harness({
    service: () => ({
      consumeLimit: async () => ({ data: true, error: null }),
      revokeSessions: async () => ({ error: new Error("Revocation failed") }),
      deleteUser: async () => {
        deleted = true;
        return { error: null };
      },
    }),
  });
  const response = await h.handler(request());
  assert.equal(response.status, 500);
  assert.equal(deleted, false);
  assert.deepEqual(await response.json(), { error: "Generic failure" });
});

test("failed deletion after session revocation is explicit and recoverable by signing in again", async () => {
  const h = harness({
    service: () => ({
      consumeLimit: async () => ({ data: true, error: null }),
      revokeSessions: async () => ({ error: null }),
      deleteUser: async () => ({ error: new Error("Storage cleanup failed") }),
    }),
  });
  const response = await h.handler(request());
  assert.equal(response.status, 500);
  assert.match(
    ((await response.json()) as { error: string }).error,
    /Sign in again before retrying/,
  );
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("malformed privileged receipts cannot advance revocation or confirm deletion", async () => {
  for (const stage of ["limit", "revoke", "delete"] as const) {
    let revoked = false;
    let deleted = false;
    const h = harness({
      service: () => ({
        consumeLimit: async () =>
          stage === "limit"
            ? ({ data: true } as never)
            : { data: true, error: null },
        revokeSessions: async () => {
          revoked = true;
          return stage === "revoke" ? ({} as never) : { error: null };
        },
        deleteUser: async () => {
          deleted = true;
          return {} as never;
        },
      }),
    });
    const response = await h.handler(request());
    assert.equal(response.status, stage === "limit" ? 503 : 500);
    assert.equal(
      ((await response.json()) as { deleted?: boolean }).deleted,
      undefined,
    );
    assert.equal(revoked, stage !== "limit");
    assert.equal(deleted, stage === "delete");
  }
});

test("the owner and verified token are frozen before the rate-limit await", async () => {
  const auth = { user: { id: A }, token: "verified-A" };
  const calls: string[] = [];
  const h = harness({
    authenticate: async () => auth,
    service: () => ({
      consumeLimit: async (owner) => {
        calls.push(owner);
        auth.user.id = B;
        auth.token = "B-token";
        return { data: true, error: null };
      },
      revokeSessions: async (token) => {
        calls.push(token);
        return { error: null };
      },
      deleteUser: async (owner) => {
        calls.push(owner);
        return { error: null };
      },
    }),
  });
  assert.equal((await h.handler(request())).status, 200);
  assert.deepEqual(calls, [A, "verified-A", A]);
});

for (const stage of ["authenticate", "limit", "revoke", "delete"] as const)
  test(`${stage} has a full-operation deadline and cannot report a late success`, async () => {
    const calls: string[] = [];
    let signal!: AbortSignal;
    const stall = () => new Promise<never>(() => {});
    const h = harness({
      timeoutMs: 5,
      authenticate: async () => {
        calls.push("authenticate");
        return stage === "authenticate"
          ? stall()
          : { user: { id: A }, token: "verified-A" };
      },
      service: (cancel) => {
        signal = cancel;
        return {
          consumeLimit: async () => {
            calls.push("limit");
            return stage === "limit" ? stall() : { data: true, error: null };
          },
          revokeSessions: async () => {
            calls.push("revoke");
            return stage === "revoke" ? stall() : { error: null };
          },
          deleteUser: async () => {
            calls.push("delete");
            return stage === "delete" ? stall() : { error: null };
          },
        };
      },
    });
    const response = await h.handler(request());
    assert.equal(response.status, 503);
    assert.equal(
      ((await response.json()) as { deleted?: boolean }).deleted,
      undefined,
    );
    assert.deepEqual(
      calls,
      ["authenticate", "limit", "revoke", "delete"].slice(
        0,
        ["authenticate", "limit", "revoke", "delete"].indexOf(stage) + 1,
      ),
    );
    if (signal) assert.equal(signal.aborted, true);
  });

test("cancelling during revocation prevents the next irreversible deletion stage", async () => {
  const started = deferred<void>();
  const result = deferred<{ error: null }>();
  const controller = new AbortController();
  let deleted = false;
  const h = harness({
    service: () => ({
      consumeLimit: async () => ({ data: true, error: null }),
      revokeSessions: async () => {
        started.resolve();
        return result.promise;
      },
      deleteUser: async () => {
        deleted = true;
        return { error: null };
      },
    }),
  });
  const pending = h.handler(request(controller.signal));
  await started.promise;
  controller.abort();
  assert.equal((await pending).status, 503);
  result.resolve({ error: null });
  await Promise.resolve();
  assert.equal(deleted, false);
});

test("already aborted requests and unavailable service cannot dispatch deletion", async () => {
  const controller = new AbortController();
  controller.abort();
  const aborted = harness();
  assert.equal((await aborted.handler(request(controller.signal))).status, 503);
  assert.equal(aborted.calls.length, 0);
  const unavailable = harness({ service: () => null });
  assert.equal((await unavailable.handler(request())).status, 503);
  assert.deepEqual(unavailable.calls, ["authenticate"]);
});
