import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { filterURL, readFilters } from "../lib/research";
import { exploreUniversities } from "../lib/supabase/catalogue";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "pages-ui", "directory.tsx"), "utf8");

test("view-only URL changes keep a stable catalogue filter key", () => {
  const base = "country=DE&cost_max=20000&sort=rank&page=2";
  const keys = ["list", "grid", ""].map((view) => {
    const params = new URLSearchParams(base);
    if (view) params.set("view", view);
    else params.delete("view");
    return filterURL(readFilters(params));
  });
  assert.ok(keys.every((key) => key === keys[0]));
  assert.ok(keys[0].includes("country=DE"));
  const withUnresolved = filterURL(
    readFilters(new URLSearchParams(base + "&unresolved=underwater")),
  );
  assert.equal(withUnresolved, keys[0]);
});

test("only list and grid are accepted directory views", () => {
  assert.ok(source.includes('["grid", "list"] as const'));
  assert.ok(source.includes('next.set("view", name)'));
  assert.ok(source.includes(': "list"'));
});

test("empty or unknown numeric filters never become zero", () => {
  const empty = readFilters(
    new URLSearchParams("cost_max=&ielts_max=&intl_min=&graduation_min="),
  );
  assert.equal(empty.cost_max, undefined);
  assert.equal(empty.ielts_max, undefined);
  assert.equal(empty.intl_min, undefined);
  assert.equal(empty.graduation_min, undefined);
  const unknown = readFilters(
    new URLSearchParams(
      "cost_max=oops&ielts_max=high&intl_min=&graduation_min=NaN",
    ),
  );
  for (const value of [
    unknown.cost_max,
    unknown.ielts_max,
    unknown.intl_min,
    unknown.graduation_min,
  ]) {
    assert.equal(value, undefined);
    assert.notEqual(value, 0);
  }
  assert.equal(filterURL(unknown), "");
});

test("tuition commits when the slider is released, not on every step", () => {
  assert.ok(source.includes("onValueCommit"));
  assert.ok(source.includes("onValueChange={([v]) => setTuitionDraft(v)}"));
});

test("exploreUniversities forwards the caller abort signal", async () => {
  const realFetch = globalThis.fetch;
  let captured: { url: string; signal?: AbortSignal | null } | undefined;
  globalThis.fetch = (async (url: unknown, init?: { signal?: AbortSignal }) => {
    captured = { url: String(url), signal: init?.signal };
    return {
      ok: true,
      json: async () => ({
        universities: [],
        total: 0,
        medianTuition: null,
        medianAdmission: null,
        countries: 0,
      }),
    };
  }) as typeof fetch;
  try {
    const controller = new AbortController();
    await exploreUniversities(
      readFilters(new URLSearchParams("country=DE")),
      controller.signal,
    );
    assert.ok(captured?.url.startsWith("/api/catalog?mode=explore"));
    assert.equal(captured?.signal, controller.signal);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("directory wires debounce, timeout, abort, cleanup and a signalled fetch", () => {
  assert.ok(source.includes("DIRECTORY_DEBOUNCE_MS = 220"));
  assert.ok(source.includes("DIRECTORY_TIMEOUT_MS = 8000"));
  assert.ok(source.includes("new AbortController()"));
  assert.ok(source.includes("controller.signal"));
  assert.ok(source.includes("exploreUniversities("));
  assert.ok(source.includes("clearTimeout(timer)"));
  assert.ok(source.includes("clearTimeout(timeout)"));
  assert.ok(source.includes("controller.abort()"));
  assert.ok(source.includes("took too long to load"));
  assert.ok(source.includes("if (!live) return;"));
  assert.ok(source.includes("[filterKey, retry, initialResult, initialQuery, initialError]"));
});
