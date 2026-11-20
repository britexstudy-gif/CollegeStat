import test from "node:test";
import assert from "node:assert/strict";
import { handleStaffSession } from "../server/staff-session-handler";
const request = (body: unknown = { action: "status" }) =>
  new Request("https://college.example/api/staff/session", {
    method: "POST",
    body: JSON.stringify(body),
  });
const receipt = {
  active: true,
  server_time: "2026-10-12T00:00:00Z",
  expires_at: "2026-10-12T00:15:00Z",
};
const deps = () => ({
  sameOrigin: () => true,
  authenticate: async () => ({
    run: async () => ({ data: receipt, error: null }),
  }),
});
test("same-origin and sign-in are checked before reading or dispatching a session command", async () => {
  let calls = 0;
  assert.equal(
    (
      await handleStaffSession(request(), {
        sameOrigin: () => false,
        authenticate: async () => {
          calls++;
          return null;
        },
      })
    ).status,
    403,
  );
  assert.equal(calls, 0);
  assert.equal(
    (
      await handleStaffSession(request(), {
        sameOrigin: () => true,
        authenticate: async () => null,
      })
    ).status,
    401,
  );
});
test("the endpoint accepts only fixed no-argument commands and private no-store receipts", async () => {
  let calls = 0;
  const dependencies = {
    sameOrigin: () => true,
    authenticate: async () => ({
      run: async () => {
        calls++;
        return { data: receipt, error: null };
      },
    }),
  };
  for (const body of [
    { action: "start", user_id: "OTHER" },
    { action: "touch", last_active_at: 99999999999 },
    { action: "sql" },
  ])
    assert.equal(
      (await handleStaffSession(request(body), dependencies)).status,
      400,
    );
  assert.equal(calls, 0);
  const valid = await handleStaffSession(
    request({ action: "start" }),
    dependencies,
  );
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), receipt);
  assert.equal(valid.headers.get("vary"), "Authorization");
  assert.match(valid.headers.get("cache-control") ?? "", /no-store/);
  assert.equal(calls, 1);
});
test("a hung authentication lookup times out without dispatching a later ledger mutation", async () => {
  let resolve!: (
    result: Awaited<ReturnType<ReturnType<typeof deps>["authenticate"]>>,
  ) => void;
  let calls = 0;
  const pending = new Promise<
    Awaited<ReturnType<ReturnType<typeof deps>["authenticate"]>>
  >((done) => (resolve = done));
  assert.equal(
    (
      await handleStaffSession(
        request({ action: "start" }),
        { sameOrigin: () => true, authenticate: () => pending },
        15,
      )
    ).status,
    503,
  );
  resolve({
    run: async () => {
      calls++;
      return { data: receipt, error: null };
    },
  });
  await Promise.resolve();
  assert.equal(calls, 0);
});
test("a slow body is cancelled at the shared deadline and never dispatches touch", async () => {
  let cancelled = false,
    calls = 0;
  const slow = new Request("https://college.example/api/staff/session", {
    method: "POST",
    duplex: "half",
    body: new ReadableStream({
      cancel() {
        cancelled = true;
      },
    }),
  } as RequestInit);
  const response = await handleStaffSession(
    slow,
    {
      sameOrigin: () => true,
      authenticate: async () => ({
        run: async () => {
          calls++;
          return { data: receipt, error: null };
        },
      }),
    },
    15,
  );
  assert.equal(response.status, 503);
  assert.equal(cancelled, true);
  assert.equal(calls, 0);
});
test("oversized bytes and invalid receipts cannot become successful admin sessions", async () => {
  assert.equal(
    (
      await handleStaffSession(
        request({ action: "start", padding: "x".repeat(1001) }),
        deps(),
      )
    ).status,
    413,
  );
  assert.equal(
    (
      await handleStaffSession(request(), {
        sameOrigin: () => true,
        authenticate: async () => ({
          run: async () => ({ data: { active: true }, error: null }),
        }),
      })
    ).status,
    503,
  );
  assert.equal(
    (
      await handleStaffSession(request({ action: "start" }), {
        sameOrigin: () => true,
        authenticate: async () => ({
          run: async () => ({ data: null, error: { code: "42501" } }),
        }),
      })
    ).status,
    403,
  );
});
