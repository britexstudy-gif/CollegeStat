import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { rankingTable } from "../server/ranking-table";
import { globalCatalogue } from "../server/global-catalogue";
import { institutionLeidenMetrics } from "../server/leiden-metrics";
import {
  hostedLeidenProfiles,
  isReviewedLeidenCore,
  LEIDEN_RANKING_CONTEXT,
  loadHostedLeidenProfiles,
} from "../server/leiden-ranking-profiles";
import type { University } from "../lib/domain";

const original = globalCatalogue.find(
  (university) => institutionLeidenMetrics(university.id).length,
)!;
const core = institutionLeidenMetrics(original.id).find(
  (record) => record.metric === LEIDEN_RANKING_CONTEXT.metric,
)!;
const profile = (index: number, extra: Record<string, unknown> = {}) => {
  const id = String(index).padStart(6, "0");
  return {
    ...core,
    id: `metric-${id}`,
    university_id: id,
    source_id: LEIDEN_RANKING_CONTEXT.sourceId,
    license_note: LEIDEN_RANKING_CONTEXT.license,
    universities: {
      id,
      name: `University ${id}`,
      slug: `university-${id}`,
      country_code: "GB",
      published: true,
    },
    ...extra,
  };
};

let fixtureNumber = 0;
async function fixture(
  rows: ReturnType<typeof profile>[],
  options: {
    cap?: number;
    failOffset?: number;
    delayMs?: number;
    count?: number;
  } = {},
) {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `https://leiden-${++fixtureNumber}.invalid`;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "public-fixture-key";
  const calls: {
    offset: number;
    limit: number;
    signal?: AbortSignal | null;
    url: URL;
  }[] = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
    );
    assert.match(url.pathname, /\/rest\/v1\/research_metrics$/);
    assert.equal(url.searchParams.get("universities.published"), "eq.true");
    assert.equal(
      url.searchParams.get("metric"),
      `eq.${LEIDEN_RANKING_CONTEXT.metric}`,
    );
    assert.equal(
      url.searchParams.get("source_id"),
      `eq.${LEIDEN_RANKING_CONTEXT.sourceId}`,
    );
    const offset = Number(url.searchParams.get("offset"));
    const limit = Number(url.searchParams.get("limit"));
    calls.push({ offset, limit, signal: init?.signal, url });
    if (options.delayMs)
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    if (offset === options.failOffset)
      return Response.json(
        { message: "Rejected source page" },
        { status: 400 },
      );
    const page = rows.slice(
      offset,
      offset + Math.min(limit, options.cap || limit),
    );
    return Response.json(page, {
      headers: {
        "Content-Range": `${page.length ? `${offset}-${offset + page.length - 1}` : "*"}/${options.count ?? rows.length}`,
      },
    });
  };
  return {
    calls,
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

test("the Leiden table projects all reviewed exact identities and preserves every published P value", async () => {
  const receipt = JSON.parse(
    await readFile("data/published/reviewed-leiden-expansion.json", "utf8"),
  ) as {
    records: {
      university_id: string;
      source_url: string;
      values: { p: { value: number } };
    }[];
  };
  const table = await rankingTable(new URLSearchParams("provider=leiden"));
  assert.equal(table.total, receipt.records.length);
  assert.equal(table.sourceTotal, 2386);
  assert.equal(table.pages, 100);
  assert.equal(table.complete, false);
  assert.equal(table.indicatorContext?.period, "2020–2023");
  const rows = (
    await Promise.all(
      Array.from(
        { length: table.pages },
        async (_, page) =>
          (await rankingTable(new URLSearchParams(`provider=leiden&page=${page + 1}`)))
            .rows,
      ),
    )
  ).flat();
  assert.equal(
    new Set(rows.map((row) => row.university?.id)).size,
    receipt.records.length,
  );
  const byId = new Map(rows.map((row) => [row.university!.id, row]));
  for (const observation of receipt.records) {
    const row = byId.get(observation.university_id)!;
    assert.equal(
      row.rank,
      observation.values.p.value.toLocaleString("en-US", {
        maximumFractionDigits: 20,
      }),
    );
    assert.equal(row.url, observation.source_url);
    assert.equal(row.nationalRank, null);
  }
  assert.equal(rows[0].rank, "40,475");
  assert.equal(rows.at(-1)?.rank, "101");
  const filtered = await rankingTable(
    new URLSearchParams(
      `provider=leiden&q=${encodeURIComponent(rows[0].name)}&country=US`,
    ),
  );
  assert.equal(filtered.rows[0].rank, rows[0].rank);
  assert.equal(filtered.sourceTotal, 2386);
});

test("Leiden eligibility retains precise counting scope and rejects held, mismatched and unsafe evidence", async () => {
  assert.equal(isReviewedLeidenCore(core, original.id), true);
  for (const patch of [
    { verification_status: "needs_review" },
    { university_id: "other" },
    { value: NaN },
    { value: -1 },
    { period: "2016–2019" },
    { field: "Biomedical sciences" },
    { edition: "Leiden Open Edition 2024" },
    { unit: "%" },
    { source_url: "https://example.test/ranking" },
    { retrieved_at: "invalid" },
    { evidence: { ...core.evidence, counting_method: "full" } },
    { evidence: { ...core.evidence, core_publications_only: false } },
    { evidence: { ...core.evidence, license_note: "unknown" } },
    { evidence: { ...core.evidence, citation_window_end: 2025 } },
  ])
    assert.equal(
      isReviewedLeidenCore({ ...core, ...patch } as typeof core, original.id),
      false,
    );
  assert.equal(
    (await rankingTable(new URLSearchParams("provider=leiden"), undefined, undefined, [
      { ...original, published: false },
    ])).total,
    0,
  );
  assert.equal(
    (await rankingTable(new URLSearchParams("provider=leiden"), undefined, undefined, [
      {
        ...original,
        research_metrics: [],
        imported_records: [
          {
            source: "leiden",
            metric: "publications_fractional_core",
            value: 999999,
          },
        ],
      } as unknown as University,
    ])).total,
    0,
  );
  await assert.rejects(
    rankingTable(
      new URLSearchParams("provider=leiden"),
      undefined,
      undefined,
      [
        {
          ...original,
          research_metrics: [core, { ...core, value: core.value + 1 }],
        },
      ],
    ),
    /Conflicting/,
  );
  const precise = await rankingTable(
    new URLSearchParams("provider=leiden"),
    undefined,
    undefined,
    [{ ...original, research_metrics: [{ ...core, value: 1234.56789 }] }],
  );
  assert.equal(precise.rows[0].rank, "1,234.56789");
});

test("hosted Leiden reads complete normalized public evidence through lower row caps and coalesces callers", async () => {
  const rows = Array.from({ length: 5 }, (_, index) => profile(index));
  const source = await fixture(rows, { cap: 2 });
  try {
    const [first, second] = await Promise.all([
      hostedLeidenProfiles(),
      hostedLeidenProfiles(),
    ]);
    assert.equal(first, second);
    assert.deepEqual(
      first.map((university) => university.id),
      rows.map((row) => row.university_id),
    );
    assert.deepEqual(
      source.calls.map((call) => call.offset),
      [0, 2, 4],
    );
    assert.ok(
      first.every(
        (university) =>
          university.imported_records === undefined &&
          university.research_metrics?.length === 1,
      ),
    );
    const calls = source.calls.length;
    assert.equal(await hostedLeidenProfiles(), first);
    assert.equal(source.calls.length, calls);
  } finally {
    source.close();
  }
});

test("a failed later Leiden page is retryable and never caches incomplete evidence", async () => {
  const source = await fixture(
    Array.from({ length: 1001 }, (_, index) => profile(index)),
    { failOffset: 1000 },
  );
  try {
    await assert.rejects(hostedLeidenProfiles(), /loaded completely/);
    const calls = source.calls.length;
    await assert.rejects(hostedLeidenProfiles(), /loaded completely/);
    assert.ok(source.calls.length > calls);
  } finally {
    source.close();
  }
});

test("Leiden projections reject claimed totals, unpublished identities, duplicate facts and changed scope", async () => {
  for (const rows of [
    [
      profile(0, {
        universities: { ...profile(0).universities, published: false },
      }),
    ],
    [profile(0, { evidence: { ...core.evidence, counting_method: "full" } })],
    [profile(0), profile(0, { id: "metric-other", value: core.value + 1 })],
  ]) {
    const source = await fixture(rows);
    try {
      await assert.rejects(
        loadHostedLeidenProfiles(),
        /source or identity|Conflicting/,
      );
    } finally {
      source.close();
    }
  }
  const incomplete = await fixture([profile(0)], { count: 2 });
  try {
    await assert.rejects(loadHostedLeidenProfiles(), /loaded completely/);
  } finally {
    incomplete.close();
  }
  const overflow = await fixture([profile(0)], { count: 5001 });
  try {
    await assert.rejects(loadHostedLeidenProfiles(), /no partial catalogue/);
    assert.equal(overflow.calls.length, 1);
  } finally {
    overflow.close();
  }
});

test("one Leiden deadline bounds stalled transports and severe pagination caps", async () => {
  const delayed = await fixture(
    Array.from({ length: 1001 }, (_, index) => profile(index)),
    { delayMs: 25 },
  );
  try {
    await assert.rejects(
      loadHostedLeidenProfiles({ timeoutMs: 40 }),
      (error) => (error as DOMException).name === "TimeoutError",
    );
    assert.ok(delayed.calls.every((call) => call.signal?.aborted));
    const calls = delayed.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(delayed.calls.length, calls);
  } finally {
    delayed.close();
  }
  const capped = await fixture(
    Array.from({ length: 30 }, (_, index) => profile(index)),
    { cap: 1 },
  );
  try {
    await assert.rejects(loadHostedLeidenProfiles(), /no partial catalogue/);
    assert.ok(capped.calls.length <= 24);
  } finally {
    capped.close();
  }
});

test("a cancelled Leiden caller cannot cancel a shared anonymous fill and an already cancelled caller starts no work", async () => {
  const source = await fixture([profile(0)], { delayMs: 10 });
  try {
    const cancelled = new AbortController();
    cancelled.abort();
    await assert.rejects(
      hostedLeidenProfiles(cancelled.signal),
      (error) => (error as DOMException).name === "AbortError",
    );
    assert.equal(source.calls.length, 0);
    const caller = new AbortController();
    const first = hostedLeidenProfiles(caller.signal);
    const second = hostedLeidenProfiles();
    caller.abort();
    await assert.rejects(
      first,
      (error) => (error as DOMException).name === "AbortError",
    );
    assert.equal((await second).length, 1);
    assert.equal((await hostedLeidenProfiles()).length, 1);
  } finally {
    source.close();
  }
});
