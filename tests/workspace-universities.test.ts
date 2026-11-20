import test from "node:test";
import assert from "node:assert/strict";
import { loadWorkspaceUniversities } from "../lib/workspace-universities";

test("a large saved collection resolves every distinct identity with bounded concurrency", async () => {
  const ids = Array.from({ length: 211 }, (_, i) => "university-" + i);
  let active = 0,
    maximum = 0;
  const requests: string[][] = [];
  const rows = await loadWorkspaceUniversities(
    [...ids, ids[0]],
    async (batch) => {
      requests.push(batch);
      maximum = Math.max(maximum, ++active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return batch.map((id) => ({ id }));
    },
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    ids,
  );
  assert.equal(new Set(requests.flat()).size, 211);
  assert.ok(requests.every((batch) => batch.length <= 24));
  assert.ok(maximum <= 3);
});

test("switching owners prevents subsequent reads or publication of old results", async () => {
  let current = true,
    requests = 0;
  await assert.rejects(
    loadWorkspaceUniversities(
      Array.from({ length: 120 }, (_, i) => String(i)),
      async (batch) => {
        requests++;
        current = false;
        return batch.map((id) => ({ id }));
      },
      { isCurrent: () => current },
    ),
    { name: "AbortError" },
  );
  assert.ok(requests <= 3);
});

test("an aborted load stops before calling the catalogue", async () => {
  const controller = new AbortController();
  controller.abort();
  let requests = 0;
  await assert.rejects(
    loadWorkspaceUniversities(
      ["one"],
      async () => {
        requests++;
        return [];
      },
      { signal: controller.signal },
    ),
    { name: "AbortError" },
  );
  assert.equal(requests, 0);
});

test("a failed batch rejects the whole collection and stops scheduling more reads", async () => {
  let requests = 0;
  await assert.rejects(
    loadWorkspaceUniversities(
      Array.from({ length: 120 }, (_, i) => String(i)),
      async (batch) => {
        requests++;
        if (batch[0] === "0") throw new Error("Catalogue unavailable");
        return batch.map((id) => ({ id }));
      },
    ),
    /Catalogue unavailable/,
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(requests <= 3);
});

test("stalled catalogue reads time out and receive a cancelled signal", async () => {
  const signals: AbortSignal[] = [];
  await assert.rejects(loadWorkspaceUniversities(["one"], async (_, signal) => {
    signals.push(signal!);
    return new Promise<{ id: string }[]>(() => {});
  }, { timeoutMs: 10 }), /too long/);
  assert.ok(signals.length && signals.every(signal => signal.aborted));
});

test("in-flight cancellation settles even when the catalogue does not settle", async () => {
  const controller = new AbortController();
  let ready!: () => void;
  const started = new Promise<void>(resolve => { ready = resolve; });
  let actualSignal: AbortSignal | undefined;
  const pending = loadWorkspaceUniversities(["one"], async (_, signal) => {
    actualSignal = signal;
    ready();
    return new Promise<{ id: string }[]>(() => {});
  }, { signal: controller.signal });
  await started;
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert.equal(actualSignal?.aborted, true);
});
