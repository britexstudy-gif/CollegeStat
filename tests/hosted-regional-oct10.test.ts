import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  createRegionalReadContext,
  hostedRegionalEditions,
  hostedRegionalRecords,
  REGIONAL_READ_TIMEOUT_MS,
} from "../server/hosted-regional";
import { rankingTable } from "../server/ranking-table";

const edition = {
  id: "regional-public-edition",
  year: 2026,
  region: "Europe",
  subject: "Overall",
  permitted: true,
  ranking_providers: { slug: "qs", website: "https://publisher.example/rankings" },
};

function entry(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    rank: 1,
    rank_label: "1",
    verification_status: "verified",
    verified_at: "2026-10-10T00:00:00Z",
    source_id: "public-source",
    data_sources: { url: "https://publisher.example/regional-source" },
    universities: {
      id: "university-" + id,
      name: "Public university " + id,
      slug: "public-university-" + id,
      website: "https://public-university-" + id + ".example",
      country_code: "GB",
      short_name: null,
      logo_url: null,
      profile_resources: {},
      published: true,
    },
    ...overrides,
  };
}

type ReadCall = { table: string; offset: number; params: URLSearchParams; signal?: AbortSignal | null };
function publicFixture(options: {
  editions?: Record<string, unknown>[];
  entries?: Record<string, unknown>[];
  cap?: number;
  reject?: (call: ReadCall) => boolean;
  before?: (call: ReadCall) => Promise<void>;
} = {}) {
  const calls: ReadCall[] = [];
  const client = createClient("https://public-fixture.invalid", "public-fixture-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        assert.equal(url.origin, "https://public-fixture.invalid");
        assert.match(url.pathname, /^\/rest\/v1\/ranking_(?:editions|entries)$/);
        const table = url.pathname.split("/").at(-1)!;
        const offset = Number(url.searchParams.get("offset") || 0);
        const call: ReadCall = { table, offset, params: url.searchParams, signal: init?.signal };
        calls.push(call);
        if (options.before) await options.before(call);
        if (options.reject?.(call)) return Response.json({ message: "Fixture read rejected" }, { status: 400 });
        const source = table === "ranking_editions" ? options.editions || [edition] : options.entries || [];
        const requested = Number(url.searchParams.get("limit") || 1000);
        return Response.json(source.slice(offset, offset + Math.min(requested, options.cap || requested)));
      },
    },
  });
  return {
    calls,
    context: (timeoutMs = REGIONAL_READ_TIMEOUT_MS, parentSignal?: AbortSignal) =>
      createRegionalReadContext(parentSignal, { timeoutMs, database: () => client }),
  };
}

test("regional public reads preserve null-rank ties and bands without inventing exact ranks", async () => {
  const fixture = publicFixture({ entries: [
    entry("band", { rank: null, rank_label: "101–150" }),
    entry("tie", { rank: null, rank_label: "=3" }),
    entry("numeric", { rank: 2, rank_label: null }),
    entry("open-band", { rank: null, rank_label: "1501+" }),
    entry("plain", { rank: null, rank_label: "7" }),
    entry("held", { verification_status: "needs_review" }),
    entry("no-verification", { verified_at: null }),
    entry("no-source", { source_id: null }),
    entry("unsafe-source", { data_sources: { url: "http://publisher.example/source" } }),
    entry("private", { universities: { published: false } }),
    entry("reversed-band", { rank: null, rank_label: "150–101" }),
    entry("zero", { rank: 0, rank_label: null }),
    entry("unranked", { rank: null, rank_label: "Reporter" }),
  ] });
  const context = fixture.context();
  const editions = await hostedRegionalEditions(context);
  const rows = await hostedRegionalRecords("Europe", editions, context);
  assert.deepEqual(rows.map(row => row.rank_label), ["2", "=3", "7", "101–150", "1501+"]);
  assert.ok(rows.every(row => row.year === 2026 && row.source_url === "https://publisher.example/regional-source"));
  const table = await rankingTable(new URLSearchParams("scope=regional&edition=Europe"), rows, editions);
  assert.deepEqual(table.rows.map(row => row.rank), ["2", "=3", "7", "101–150", "1501+"]);
  assert.equal(table.year, 2026);
  const discovery = fixture.calls.find(call => call.table === "ranking_editions")!;
  assert.equal(discovery.params.get("ranking_providers.slug"), "eq.qs");
  assert.equal(discovery.params.get("permitted"), "eq.true");
  assert.equal(discovery.params.get("subject"), "eq.Overall");
  const positions = fixture.calls.find(call => call.table === "ranking_entries")!;
  assert.equal(positions.params.get("verification_status"), "eq.verified");
  assert.equal(positions.params.get("verified_at"), "not.is.null");
  assert.equal(positions.params.get("source_id"), "not.is.null");
  assert.equal(positions.params.get("universities.published"), "eq.true");
});

test("edition discovery retains only permitted QS regional overall editions and original years", async () => {
  const fixture = publicFixture({ editions: [
    { ...edition, id: "older", year: 2025 },
    edition,
    { ...edition, id: "private-edition", permitted: false, region: "Asia" },
    { ...edition, id: "subject-edition", subject: "Medicine", region: "Asia" },
    { ...edition, id: "other-publisher", ranking_providers: { slug: "the", website: "https://publisher.example" } },
    { ...edition, id: "world-edition", region: "Global" },
  ] });
  assert.deepEqual((await hostedRegionalEditions(fixture.context())).map(row => [row.id, row.scope, row.year]), [
    [edition.id, "Europe", 2026],
  ]);
});

test("short capped source pages advance by rows returned and do not skip later positions", async () => {
  const fixture = publicFixture({ cap: 2, entries: Array.from({ length: 5 }, (_, i) => entry(String(i), { rank: i + 1, rank_label: String(i + 1) })) });
  const rows = await hostedRegionalRecords("Europe", undefined, fixture.context());
  assert.deepEqual(rows.map(row => row.rank_label), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(fixture.calls.filter(call => call.table === "ranking_entries").map(call => call.offset), [0, 2, 4, 5]);
});

test("a rejected later source page fails instead of returning partial verified coverage", async () => {
  const fixture = publicFixture({
    cap: 2,
    entries: [entry("first"), entry("second"), entry("third")],
    reject: call => call.table === "ranking_entries" && call.offset === 2,
  });
  await assert.rejects(hostedRegionalRecords("Europe", undefined, fixture.context()), /Regional positions could not be loaded/);
  assert.equal(fixture.calls.filter(call => call.table === "ranking_entries").length, 2);
});

test("rejected discovery never silently becomes a historical fallback table", async () => {
  const fixture = publicFixture({ reject: call => call.table === "ranking_editions" });
  await assert.rejects(hostedRegionalRecords("Europe", undefined, fixture.context()), /Regional editions could not be loaded/);
  assert.equal(fixture.calls.length, 1);
});

test("an empty successful project preserves the installed historical selection", async () => {
  const fixture = publicFixture({ editions: [] });
  const rows = await hostedRegionalRecords("Europe", undefined, fixture.context());
  assert.ok(rows.length > 0);
  assert.ok(rows.every(row => row.scope === "Europe" && row.year === 2026));
  assert.equal(fixture.calls.length, 1);
});

test("one deadline covers discovery and entries even when transport ignores cancellation", async () => {
  const fixture = publicFixture({
    entries: [entry("first")],
    before: call => new Promise(resolve => setTimeout(resolve, call.table === "ranking_editions" ? 50 : 350)),
  });
  const context = fixture.context(250);
  await assert.rejects(hostedRegionalRecords("Europe", undefined, context), error =>
    (error as DOMException).name === "TimeoutError",
  );
  assert.ok(context.signal.aborted);
  assert.ok(fixture.calls.some(call => call.table === "ranking_entries"));
  assert.ok(fixture.calls.every(call => call.signal === context.signal));
});

test("parent cancellation settles a stalled read and starts no next page", async () => {
  let started!: () => void;
  const reading = new Promise<void>(resolve => { started = resolve; });
  const fixture = publicFixture({ before: call => {
    if (call.table !== "ranking_entries") return Promise.resolve();
    started();
    return new Promise<void>(() => {});
  } });
  const controller = new AbortController();
  const request = hostedRegionalRecords("Europe", undefined, fixture.context(8000, controller.signal));
  await reading;
  controller.abort();
  await assert.rejects(request, error => (error as DOMException).name === "AbortError");
  assert.equal(fixture.calls.filter(call => call.table === "ranking_entries").length, 1);
});

test("already cancelled callers do not start public database reads", async () => {
  const fixture = publicFixture();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(hostedRegionalEditions(fixture.context(8000, controller.signal)), error =>
    (error as DOMException).name === "AbortError",
  );
  assert.deepEqual(fixture.calls, []);
});

test("bounded source overflow fails instead of silently truncating a regional edition", async () => {
  const fixture = publicFixture({ entries: Array.from({ length: 5001 }, (_, i) => entry(String(i), { rank: i + 1, rank_label: String(i + 1) })) });
  await assert.rejects(hostedRegionalRecords("Europe", undefined, fixture.context()), /no partial table was returned/);
  assert.equal(fixture.calls.filter(call => call.table === "ranking_entries").at(-1)?.offset, 5000);
});
