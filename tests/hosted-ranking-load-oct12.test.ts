import assert from "node:assert/strict";
import test from "node:test";
import {
  hostedRankingProfiles,
  loadHostedRankingProfiles,
} from "../server/hosted-catalogue";

const profile = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  name: `University ${id}`,
  slug: `university-${id}`,
  country_code: "GB",
  rankings: [{ provider: "qs", year: 2027, scope: "Global", rank: 1 }],
  ranking_entries: [],
  imported_records: [],
  ...extra,
});

let fixtureNumber = 0;
async function fixture(
  rows: Record<string, unknown>[],
  options: { cap?: number; rejectOffset?: number; delayMs?: number } = {},
) {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `https://ranking-${++fixtureNumber}.invalid`;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "public-fixture-key";
  const calls: {
    offset: number;
    limit: number;
    signal?: AbortSignal | null;
  }[] = [];
  let pending = 0;
  let peak = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    assert.match(url.pathname, /\/rest\/v1\/rpc\/ranking_profiles$/);
    const args = JSON.parse(String(init?.body));
    const offset = Number(args.result_offset);
    const limit = Number(args.result_limit);
    calls.push({ offset, limit, signal: init?.signal });
    peak = Math.max(peak, ++pending);
    await new Promise((resolve) => setTimeout(resolve, options.delayMs || 5));
    pending--;
    if (offset === options.rejectOffset)
      return Response.json(
        { message: "Rejected source page" },
        { status: 503 },
      );
    return Response.json(
      rows.slice(offset, offset + Math.min(limit, options.cap || limit)),
    );
  };
  return {
    calls,
    peak: () => peak,
    close() {
      globalThis.fetch = originalFetch;
      if (originalUrl === undefined)
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      if (originalKey === undefined)
        delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = originalKey;
    },
  };
}

test("cold public ranking loads overlap at most two pages and coalesce callers", async () => {
  const source = Array.from({ length: 3064 }, (_, i) => profile(String(i)));
  const publicFixture = await fixture(source);
  try {
    const [first, concurrent] = await Promise.all([
      hostedRankingProfiles(),
      hostedRankingProfiles(),
    ]);
    assert.deepEqual(
      first.map((row) => row.id),
      source.map((row) => row.id),
    );
    assert.equal(first, concurrent);
    assert.equal(publicFixture.peak(), 2);
    assert.ok(publicFixture.calls.length <= 8);
    const calls = publicFixture.calls.length;
    assert.equal(await hostedRankingProfiles(), first);
    assert.equal(publicFixture.calls.length, calls);
  } finally {
    publicFixture.close();
  }
});

test("a lower public API row cap never drops later ranking profiles", async () => {
  const source = Array.from({ length: 5 }, (_, i) => profile(String(i)));
  const publicFixture = await fixture(source, { cap: 2 });
  try {
    assert.deepEqual(
      (await hostedRankingProfiles()).map((row) => row.id),
      source.map((row) => row.id),
    );
    assert.ok(publicFixture.calls.some((call) => call.offset === 2));
    assert.ok(publicFixture.calls.some((call) => call.offset === 4));
  } finally {
    publicFixture.close();
  }
});

test("only-Leiden partial indicators survive normalization and repeated identities retain every scope", async () => {
  const leiden = {
    source: "leiden",
    metric: "papers",
    value: 12,
    national_rank: 3,
    verification_status: "verified",
    publication_status: "published",
    reporting_year: 2024,
  };
  const position = (id: string, year: number, region: string) => ({
    id,
    university_id: "same",
    edition_id: id,
    rank: null,
    rank_label: "101–150",
    verification_status: "verified",
    verified_at: "2026-10-12T00:00:00Z",
    source_id: "publisher-source",
    ranking_editions: {
      year,
      region,
      subject: "Overall",
      ranking_providers: { slug: "qs" },
    },
  });
  const source = [
    profile("same", {
      rankings: [{ provider: "qs", year: 2027, scope: "Global", rank: 2 }],
      ranking_entries: [position("world", 2027, "Global")],
    }),
    profile("same", {
      rankings: [{ provider: "qs", year: 2026, scope: "Europe", rank: 5 }],
      ranking_entries: [position("regional", 2026, "Europe")],
    }),
    profile("leiden", {
      rankings: [],
      ranking_entries: undefined,
      imported_records: [leiden],
    }),
  ];
  const publicFixture = await fixture(source);
  try {
    const rows = await hostedRankingProfiles();
    assert.deepEqual(
      rows.map((row) => row.id),
      ["same", "leiden"],
    );
    assert.deepEqual(
      rows[0].rankings,
      [source[0].rankings, source[1].rankings].flat(),
    );
    assert.deepEqual(
      rows[0].ranking_entries,
      [source[0].ranking_entries, source[1].ranking_entries].flat(),
    );
    assert.deepEqual(rows[1].imported_records, [leiden]);
  } finally {
    publicFixture.close();
  }
});

test("ranking source overflow fails instead of returning incomplete coverage", async () => {
  const publicFixture = await fixture(
    Array.from({ length: 10001 }, (_, i) => profile(String(i))),
  );
  try {
    await assert.rejects(
      hostedRankingProfiles(),
      /no partial catalogue was returned/,
    );
    assert.ok(publicFixture.calls.some((call) => call.offset === 10000));
    assert.ok(publicFixture.calls.length <= 24);
  } finally {
    publicFixture.close();
  }
});

test("exactly the maximum ranking coverage is complete after an empty overflow check", async () => {
  const source = Array.from({ length: 10000 }, (_, i) => profile(String(i)));
  const publicFixture = await fixture(source);
  try {
    assert.equal((await hostedRankingProfiles()).length, source.length);
    assert.deepEqual(publicFixture.calls.at(-1)?.offset, 10000);
    assert.deepEqual(publicFixture.calls.at(-1)?.limit, 1);
  } finally {
    publicFixture.close();
  }
});

test("a failed later ranking page remains retryable and never caches partial coverage", async () => {
  const publicFixture = await fixture(
    Array.from({ length: 1001 }, (_, i) => profile(String(i))),
    { rejectOffset: 1000 },
  );
  try {
    await assert.rejects(
      hostedRankingProfiles(),
      /Ranking profiles could not be loaded/,
    );
    const calls = publicFixture.calls.length;
    await assert.rejects(
      hostedRankingProfiles(),
      /Ranking profiles could not be loaded/,
    );
    assert.ok(publicFixture.calls.length > calls);
  } finally {
    publicFixture.close();
  }
});

test("one deadline settles the complete scan when later transports ignore cancellation", async () => {
  const publicFixture = await fixture(
    Array.from({ length: 3064 }, (_, i) => profile(String(i))),
    { delayMs: 25 },
  );
  try {
    await assert.rejects(
      loadHostedRankingProfiles({ timeoutMs: 40 }),
      (error) => (error as DOMException).name === "TimeoutError",
    );
    assert.ok(publicFixture.calls.some((call) => call.offset === 2000));
    assert.equal(
      new Set(publicFixture.calls.map((call) => call.signal)).size,
      1,
    );
    assert.ok(publicFixture.calls.every((call) => call.signal?.aborted));
    const calls = publicFixture.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(publicFixture.calls.length, calls);
  } finally {
    publicFixture.close();
  }
});

test("a cancelled caller cannot cancel or poison the shared anonymous ranking fill", async () => {
  const publicFixture = await fixture([profile("public")], { delayMs: 20 });
  try {
    const caller = new AbortController();
    const cancelled = hostedRankingProfiles(caller.signal);
    const remaining = hostedRankingProfiles();
    caller.abort();
    await assert.rejects(
      cancelled,
      (error) => (error as DOMException).name === "AbortError",
    );
    assert.deepEqual(
      (await remaining).map((row) => row.id),
      ["public"],
    );
    assert.ok(publicFixture.calls.length <= 4);
    const calls = publicFixture.calls.length;
    assert.deepEqual(
      (await hostedRankingProfiles()).map((row) => row.id),
      ["public"],
    );
    assert.equal(publicFixture.calls.length, calls);
  } finally {
    publicFixture.close();
  }
});

test("an already cancelled ranking caller starts no database work", async () => {
  const publicFixture = await fixture([profile("public")]);
  try {
    const caller = new AbortController();
    caller.abort();
    await assert.rejects(
      hostedRankingProfiles(caller.signal),
      (error) => (error as DOMException).name === "AbortError",
    );
    assert.deepEqual(publicFixture.calls, []);
  } finally {
    publicFixture.close();
  }
});

test("a severe source row cap stops within the work budget and returns no partial catalogue", async () => {
  const publicFixture = await fixture(
    Array.from({ length: 100 }, (_, i) => profile(String(i))),
    { cap: 1 },
  );
  try {
    await assert.rejects(
      hostedRankingProfiles(),
      /no partial catalogue was returned/,
    );
    assert.ok(publicFixture.calls.length <= 24);
    assert.equal(publicFixture.peak(), 2);
  } finally {
    publicFixture.close();
  }
});
