import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkspaceLoader,
  createWorkspacePageReader,
  WORKSPACE_COLLECTION_LIMIT,
  WORKSPACE_MAX_BYTES,
  WORKSPACE_MAX_PAGE_REQUESTS,
  WorkspaceCapacityError,
  type WorkspacePageRequest,
} from "../services/workspace";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rows = (count: number) => Array.from({ length: count }, (_, i) => ({
  id: id(i + 1), user_id: owner, university_id: id(i + 10000), status: "saved", deadline: null,
}));
function reader(source: ReturnType<typeof rows>, cap = 200) {
  const calls: WorkspacePageRequest[] = [];
  const readPage = async (request: WorkspacePageRequest) => {
    calls.push(request);
    return { data: request.table === "saved_universities"
      ? source.filter(row => !request.after || row.id > request.after).slice(0, Math.min(cap, request.limit)) : [], error: null };
  };
  return { calls, readPage };
}

test("workspace reads past 200 records and a shorter server cap until an empty page", async () => {
  const source = rows(317);
  const h = reader(source, 80);
  const result = await createWorkspaceLoader(h)(owner);
  assert.deepEqual(result.saved.map(row => row.id), source.map(row => row.id));
  assert.equal(h.calls.filter(c => c.table === "saved_universities").length, 5);
  assert.equal(Object.values(result).flat().length, 317);
  assert.ok(h.calls.every(c => c.userId === owner && c.limit <= 200));
});

test("exact collection capacity is allowed only after the final empty page", async () => {
  const h = reader(rows(WORKSPACE_COLLECTION_LIMIT));
  assert.equal((await createWorkspaceLoader(h)(owner)).saved.length, WORKSPACE_COLLECTION_LIMIT);
  const calls = h.calls.filter(c => c.table === "saved_universities");
  assert.equal(calls.at(-1)?.limit, 1);
  assert.equal(calls.at(-1)?.after, id(WORKSPACE_COLLECTION_LIMIT));
});

test("a row beyond capacity rejects rather than publishing a truncated workspace", async () => {
  await assert.rejects(createWorkspaceLoader(reader(rows(WORKSPACE_COLLECTION_LIMIT + 1)))(owner), WorkspaceCapacityError);
});

test("a low server cap is bounded even when every page makes progress", async () => {
  const h = reader(rows(100), 1);
  await assert.rejects(createWorkspaceLoader(h)(owner), /bounded requests/);
  assert.equal(h.calls.filter(c => c.table === "saved_universities").length, WORKSPACE_MAX_PAGE_REQUESTS);
});

test("workspace rejects another owner, repeated cursors and descending rows", async () => {
  for (const data of [
    [{ ...rows(1)[0], user_id: other }],
    [rows(1)[0], rows(1)[0]],
    [rows(2)[1], rows(2)[0]],
  ]) {
    await assert.rejects(createWorkspaceLoader({ readPage: async () => ({ data, error: null }) })(owner), /unexpected response/);
  }
});

test("workspace checks UTF-8 bytes and never treats oversized notes as complete", async () => {
  await assert.rejects(createWorkspaceLoader({ readPage: async request => ({
    data: request.table === "user_notes" ? [{ ...rows(1)[0], body: "界".repeat(Math.ceil(WORKSPACE_MAX_BYTES / 3)) }] : [], error: null,
  }) })(owner), /8 MiB/);
});

test("workspace timeout settles even if a read ignores its abort signal", async () => {
  const signals: AbortSignal[] = [];
  await assert.rejects(createWorkspaceLoader({ timeoutMs: 10, readPage: request => {
    signals.push(request.signal);
    return new Promise(() => {});
  } })(owner), /timed out/);
  assert.ok(signals.length > 0 && signals.every(s => s.aborted));
});

test("aborting the workspace cancels all pending collections without returning partial success", async () => {
  const controller = new AbortController();
  const signals: AbortSignal[] = [];
  const pending = createWorkspaceLoader({ readPage: request => {
    signals.push(request.signal);
    return new Promise(() => {});
  } })(owner, { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.ok(signals.every(s => s.aborted));
});

test("one collection error aborts its siblings and a pre-aborted load does not read", async () => {
  const signals: AbortSignal[] = [];
  await assert.rejects(createWorkspaceLoader({ readPage: async request => {
    signals.push(request.signal);
    if (request.table === "saved_universities") return { data: null, error: new Error("offline") };
    return new Promise(() => {});
  } })(owner), /could not be loaded/);
  assert.ok(signals.every(s => s.aborted));
  const controller = new AbortController();
  controller.abort();
  let called = false;
  await assert.rejects(createWorkspaceLoader({ readPage: async () => { called = true; return { data: [], error: null }; } })(owner, { signal: controller.signal }), { name: "AbortError" });
  assert.equal(called, false);
});

test("workspace PostgREST reader applies owner, stable cursor, projection and cancellation", async () => {
  const calls: unknown[][] = [];
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["select", "eq", "order", "gt", "limit", "abortSignal"]) chain[method] = (...args) => { calls.push([method, ...args]); return method === "abortSignal" ? Promise.resolve({ data: [], error: null }) : chain; };
  const db = { from: (table: string) => { calls.push(["from", table]); return chain; } };
  const signal = new AbortController().signal;
  await createWorkspacePageReader(db as unknown as Parameters<typeof createWorkspacePageReader>[0])({ table: "saved_universities", columns: "id,user_id", userId: owner, after: id(10), limit: 200, signal });
  assert.deepEqual(calls, [["from", "saved_universities"], ["select", "id,user_id"], ["eq", "user_id", owner], ["order", "id", { ascending: true }], ["gt", "id", id(10)], ["limit", 200], ["abortSignal", signal]]);
});
