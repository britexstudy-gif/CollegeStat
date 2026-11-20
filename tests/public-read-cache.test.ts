import assert from "node:assert/strict";
import test from "node:test";
import { publicReadCache } from "../server/public-read-cache";

test("public reads coalesce concurrent loads and expire after completion", async () => {
  let time = 0;
  let loads = 0;
  let release!: (value: string) => void;
  const cache = publicReadCache<string>(2, 60, () => time);
  const load = () => {
    loads++;
    return new Promise<string>((resolve) => {
      release = resolve;
    });
  };
  const first = cache("same-filter", load);
  const second = cache("same-filter", load);
  await Promise.resolve();
  assert.equal(loads, 1);
  time = 100;
  release("published result");
  assert.deepEqual(await Promise.all([first, second]), [
    "published result",
    "published result",
  ]);
  time = 159;
  assert.equal(await cache("same-filter", load), "published result");
  time = 160;
  assert.equal(
    await cache("same-filter", async () => {
      loads++;
      return "new published result";
    }),
    "new published result",
  );
  assert.equal(loads, 2);
});

test("failed public queries remain retryable rather than caching an outage", async () => {
  const cache = publicReadCache<number>(1);
  await assert.rejects(
    cache("query", async () => {
      throw new Error("provider unavailable");
    }),
  );
  assert.equal(await cache("query", async () => 14), 14);
});

test("public cache keeps its capacity and evicts least recently read entries", async () => {
  const cache = publicReadCache<number>(2);
  await cache("a", async () => 1);
  await cache("b", async () => 2);
  assert.equal(await cache("a", async () => 99), 1);
  await cache("c", async () => 3);
  assert.equal(await cache("b", async () => 22), 22);
});

test("a completed evicted request cannot replace a newer entry", async () => {
  const cache = publicReadCache<string>(1);
  let release!: (value: string) => void;
  const old = cache(
    "a",
    () =>
      new Promise<string>((resolve) => {
        release = resolve;
      }),
  );
  await Promise.resolve();
  await cache("b", async () => "b");
  await cache("a", async () => "new a");
  release("old a");
  assert.equal(await old, "old a");
  assert.equal(await cache("a", async () => "wrong"), "new a");
});

test("an abandoned HTTP load expires and cannot overwrite its replacement", async () => {
  let time = 0;
  const cache = publicReadCache<string>(1, 60, () => time, 45);
  let release!: (value: string) => void;
  const abandoned = cache(
    "public",
    () =>
      new Promise<string>((resolve) => {
        release = resolve;
      }),
  );
  await Promise.resolve();
  time = 46;
  assert.equal(await cache("public", async () => "recovered"), "recovered");
  release("stale");
  assert.equal(await abandoned, "stale");
  assert.equal(await cache("public", async () => "wrong"), "recovered");
});
