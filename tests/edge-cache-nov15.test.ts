import { test } from "node:test";
import assert from "node:assert/strict";
import {
  edgeCachePolicy,
  edgeHints,
  edgeLifetime,
  pageCacheControl,
  shortEdgeCache,
  skipEdgeCache,
  type EdgeHint,
} from "../server/edge-cache";
import { splitProfile } from "../server/profile-split";
import { mergeHeavyProfile } from "../lib/profile-defer";
import { universityBySlug } from "../server/catalogue-store";
import type { ImportedRecord } from "../lib/domain";

const site = "https://collegestat.example";
const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(site + path, { headers });
const ok = (headers: Record<string, string> = {}, status = 200) =>
  new Response("x", { status, headers });
const clean: EdgeHint = { skip: false, fallback: false };

test("only public, user-independent GETs get an edge key", () => {
  for (const path of [
    "/",
    "/universities",
    "/universities?country=DE&page=2",
    "/university/mit",
    "/rankings",
    "/scholarships",
    "/scholarships/chevening",
    "/articles",
    "/articles/some-guide",
    "/api/catalog?q=mit",
    "/api/public/university/mit",
    "/compare?ids=a,b",
    "/methodology",
    "/privacy",
  ])
    assert.ok(edgeCachePolicy(get(path), "b1"), path);
  for (const path of [
    "/dashboard",
    "/dashboard/universities",
    "/auth/sign-in",
    "/auth/callback?code=1",
    "/profile",
    "/saved",
    "/settings",
    "/staff/college-console",
    "/admin",
    "/api/account",
    "/api/student-ai",
    "/api/auth/providers",
    "/compare/x",
    "/support",
  ])
    assert.equal(edgeCachePolicy(get(path), "b1"), null, path);
  assert.equal(edgeCachePolicy(new Request(site + "/", { method: "POST" }), "b1"), null);
  assert.equal(edgeCachePolicy(new Request(site + "/", { method: "HEAD" }), "b1"), null);
  assert.equal(edgeCachePolicy(get("/", { authorization: "Bearer x" }), "b1"), null);
});

test("the key separates language, build, query order and router payloads", () => {
  const key = (path: string, headers: Record<string, string> = {}, build = "b1") =>
    edgeCachePolicy(get(path, headers), build)!.key;
  assert.notEqual(key("/", { cookie: "cs-lang=ru" }), key("/", { cookie: "cs-lang=uz" }));
  // The cookie wins over Accept-Language, exactly as the layout resolves it.
  assert.equal(
    key("/", { cookie: "a=1; cs-lang=ru", "accept-language": "de" }),
    key("/", { cookie: "cs-lang=ru" }),
  );
  assert.equal(key("/", { "accept-language": "de-DE,de;q=0.9" }), key("/", { cookie: "cs-lang=de" }));
  assert.equal(key("/"), key("/", { "accept-language": "fr" }));
  // Session cookies do not split or personalise the entry.
  assert.equal(key("/", { cookie: "cs_session=1; sb-x-auth-token=abc" }), key("/"));
  assert.notEqual(key("/", {}, "b1"), key("/", {}, "b2"));
  assert.equal(key("/universities?b=2&a=1"), key("/universities?a=1&b=2"));
  assert.notEqual(key("/universities?country=DE"), key("/universities?country=FR"));
  assert.notEqual(key("/rankings", { rsc: "1" }), key("/rankings"));
  assert.notEqual(
    key("/rankings", { rsc: "1", "next-router-state-tree": "a" }),
    key("/rankings", { rsc: "1", "next-router-state-tree": "b" }),
  );
  // API JSON does not depend on the interface language.
  assert.equal(key("/api/catalog?q=a", { cookie: "cs-lang=ru" }), key("/api/catalog?q=a"));
  assert.ok(key("/").startsWith(site + "/?"));
});

test("errors, cookies, fallbacks and private responses are never shared", () => {
  const page = edgeCachePolicy(get("/"), "b1")!;
  const api = edgeCachePolicy(get("/api/catalog"), "b1")!;
  assert.deepEqual(edgeLifetime(page, ok({ "cache-control": "no-store, must-revalidate" }), clean), {
    fresh: 259200,
    stale: 2592000,
  });
  assert.equal(edgeLifetime(page, ok({}, 404), clean), null);
  assert.equal(edgeLifetime(page, ok({}, 500), clean), null);
  assert.equal(edgeLifetime(page, ok({ "set-cookie": "a=b" }), clean), null);
  assert.equal(edgeLifetime(page, ok({ "cache-control": "private, no-store" }), clean), null);
  assert.equal(edgeLifetime(page, ok({ vary: "Cookie" }), clean), null);
  assert.ok(edgeLifetime(page, ok({ vary: "RSC, Next-Router-State-Tree, Accept-Encoding" }), clean));
  assert.equal(edgeLifetime(page, ok(), { skip: true, fallback: false }), null);
  assert.deepEqual(edgeLifetime(page, ok(), { skip: false, fallback: true }), { fresh: 300, stale: 3600 });
  assert.equal(edgeLifetime(api, ok({ "cache-control": "no-store" }), clean), null);
  assert.equal(edgeLifetime(api, ok(), clean), null);
  assert.deepEqual(edgeLifetime(api, ok({ "cache-control": "public, max-age=60" }), clean), {
    fresh: 60,
    stale: 600,
  });
  assert.deepEqual(
    edgeLifetime(api, ok({ "cache-control": "public, max-age=300, s-maxage=3600" }), clean)?.fresh,
    3600,
  );
  assert.equal(
    pageCacheControl({ fresh: 300, stale: 86400 }),
    "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
  );
});

test("render hints reach only the request that set them", async () => {
  const first: EdgeHint = { skip: false, fallback: false };
  const second: EdgeHint = { skip: false, fallback: false };
  await Promise.all([
    edgeHints.run(first, async () => {
      await Promise.resolve();
      skipEdgeCache();
    }),
    edgeHints.run(second, async () => {
      shortEdgeCache();
    }),
  ]);
  assert.deepEqual(first, { skip: true, fallback: false });
  assert.deepEqual(second, { skip: false, fallback: true });
  // Outside a request (tests, scripts) the markers are no-ops.
  skipEdgeCache();
});

test("per-programme completion records move to the deferred part and merge back", async () => {
  const full = await universityBySlug("tum");
  assert.ok(full);
  const completion = {
    id: "c1",
    metric: "completions_cip_04.0201_award_17",
    value: 7,
    source: "ipeds",
  } as ImportedRecord;
  const tuition = { id: "t1", metric: "tuition_in_state", value: 1, source: "ipeds" } as ImportedRecord;
  const record = { ...full, imported_records: [tuition, completion] };
  const { lite, heavy } = splitProfile(record);
  assert.deepEqual(lite.imported_records, [tuition]);
  assert.deepEqual(heavy.academic_records, [completion]);
  assert.deepEqual(mergeHeavyProfile(lite, heavy).imported_records, [tuition, completion]);
  // A heavy payload from before this change still merges.
  const { academic_records: _old, ...older } = heavy;
  void _old;
  assert.deepEqual(
    mergeHeavyProfile(lite, older as typeof heavy).imported_records,
    [tuition],
  );
});
