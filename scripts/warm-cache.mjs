#!/usr/bin/env node
// Warms the Worker's edge cache (worker/index.ts, server/edge-cache.ts) after a
// deploy, so the first real visitors get cached HTML instead of a cold render.
//
//   npm run warm                                  # https://collegestat.xyz
//   npm run warm -- https://collegestat.xyz --concurrency=8 --langs=en,ru,uz --top=300
//   npm run warm -- --dry-run                     # list the URLs only
//
// What it requests (HTML documents only):
//   - hub pages from the sitemap (home, /universities, /rankings, /scholarships,
//     /articles, /compare, info pages) in every interface language;
//   - every scholarship page, the target universities (data/segment/targets.json)
//     and the ~300 best-ranked universities (data/published/ranking-all.json),
//     in --langs (default en,ru,uz).
// Only university slugs listed in the live sitemap are requested.
//
// The cache key varies on the interface language (cs-lang cookie) and, for
// client navigations, on the router headers (RSC, Next-Router-State-Tree,
// Next-Url). Those RSC keys depend on the page the visitor navigates from, so
// they cannot be warmed generically; the HTML of every page is.
//
// The Workers Cache API is per data center: this warms the location(s) that
// serve this machine (or the Worker's Smart Placement location). Pages that were
// rendered from the bundled fallback (X-Edge-Ttl below one hour) are requested
// again after their short lifetime so the background refresh replaces them.
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a === "--" + name || a.startsWith("--" + name + "="));
  if (!hit) return fallback;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : true;
};
const base = (args.find((a) => !a.startsWith("--")) || "https://collegestat.xyz").replace(/\/+$/, "");
const concurrency = Math.max(1, Number(flag("concurrency", 8)) || 8);
const top = Math.max(0, Number(flag("top", 300)) || 0);
const ALL_LANGS = ["en", "uz", "ru", "es", "de", "zh"]; // lib/i18n/languages.ts
const deepLangs = String(flag("langs", "en,ru,uz")).split(",").filter((l) => ALL_LANGS.includes(l));
const dryRun = flag("dry-run", false) === true;
const recheck = flag("no-recheck", false) !== true;
const root = new URL("../", import.meta.url);
const readJSON = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const UA = "CollegeStat-cache-warmer/1.0";

async function text(url) {
  const response = await fetch(url, { headers: { "user-agent": UA } });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.text();
}
const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
/** Sitemap URLs may name another origin (built for a different SITE_URL); keep the path. */
const pathOf = (loc) => {
  try {
    return new URL(loc).pathname;
  } catch {
    return null;
  }
};

async function sitemapPaths() {
  const index = await text(base + "/sitemap.xml");
  const files = locs(index).map(pathOf).filter(Boolean);
  const paths = [];
  for (const file of files.length ? files : ["/sitemap.xml"])
    paths.push(...locs(await text(base + file)).map(pathOf).filter(Boolean));
  return paths;
}

function topRankedSlugs(limit) {
  if (!limit) return [];
  const index = readJSON("data/published/ranking-profile-index.json");
  const best = new Map();
  for (const row of readJSON("data/published/ranking-all.json")) {
    if (!row.university_id || !Number.isFinite(row.rank)) continue;
    best.set(row.university_id, Math.min(best.get(row.university_id) ?? Infinity, row.rank));
  }
  return [...best]
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => index[id]?.[0])
    .filter(Boolean)
    .slice(0, limit);
}

async function plan() {
  const paths = await sitemapPaths();
  const listed = new Set(paths);
  const HUBS = /^\/(?:|universities|rankings|scholarships|articles|compare|methodology|sources|about|terms|privacy)$/;
  const hubs = [...new Set(["/", ...paths.filter((p) => HUBS.test(p))])];
  const scholarships = paths.filter((p) => /^\/scholarships\/[^/]+$/.test(p));
  const targets = readJSON("data/segment/targets.json").universities.map((u) => "/university/" + u.slug);
  const ranked = topRankedSlugs(top).map((slug) => "/university/" + slug);
  const universities = [...new Set([...targets, ...ranked])].filter((p) => listed.has(p));
  const jobs = [];
  for (const path of hubs) for (const lang of ALL_LANGS) jobs.push({ path, lang });
  for (const path of [...scholarships, ...universities]) for (const lang of deepLangs) jobs.push({ path, lang });
  return { jobs, counts: { hubs: hubs.length, scholarships: scholarships.length, universities: universities.length } };
}

async function warm({ path, lang }) {
  const started = Date.now();
  try {
    const response = await fetch(base + path, {
      redirect: "manual",
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml",
        "accept-language": lang,
        cookie: "cs-lang=" + lang,
      },
    });
    // Read the whole body: the Worker stores the copy once the stream completes.
    await response.arrayBuffer();
    return {
      path,
      lang,
      status: response.status,
      cache: response.headers.get("x-edge-cache") || "-",
      ttl: Number(response.headers.get("x-edge-ttl")) || 0,
      ms: Date.now() - started,
    };
  } catch (error) {
    return { path, lang, status: 0, cache: "ERR", ttl: 0, ms: Date.now() - started, error: String(error) };
  }
}

async function run(jobs) {
  const results = [];
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const result = await warm(job);
      results.push(result);
      if (++done % 50 === 0 || done === jobs.length)
        process.stdout.write(`  ${done}/${jobs.length}\n`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
  return results;
}

function summarize(label, results) {
  const by = {};
  for (const r of results) by[r.cache] = (by[r.cache] || 0) + 1;
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  const p = (q) => ms[Math.min(ms.length - 1, Math.floor(q * ms.length))] ?? 0;
  console.log(`${label}: ${results.length} requests`, by, `p50 ${p(0.5)} ms, p90 ${p(0.9)} ms`);
  const failed = results.filter((r) => r.status !== 200);
  for (const r of failed.slice(0, 20)) console.log(`  ${r.status || r.error} ${r.lang} ${r.path}`);
  if (failed.length > 20) console.log(`  …and ${failed.length - 20} more non-200 responses`);
}

const { jobs, counts } = await plan();
console.log(
  `Warming ${base}: ${counts.hubs} hub pages × ${ALL_LANGS.length} languages, ` +
    `${counts.scholarships} scholarships + ${counts.universities} universities × ${deepLangs.join("/")} ` +
    `= ${jobs.length} requests, concurrency ${concurrency}`,
);
if (dryRun) {
  for (const job of jobs) console.log(job.lang, job.path);
  process.exit(0);
}
// Hubs first: they share the hosted catalogue read, which then fills the
// isolate's memo for everything after.
const results = await run(jobs);
summarize("pass 1", results);
const short = results.filter((r) => r.status === 200 && r.cache === "MISS" && r.ttl > 0 && r.ttl < 3600);
if (recheck && short.length) {
  // Fallback renders are shared for 30 s; after that the next request is served
  // stale and refreshed in the background with the full lifetime.
  console.log(`${short.length} pages were rendered from the fallback; re-requesting in 35 s…`);
  await new Promise((done) => setTimeout(done, 35000));
  summarize("recheck", await run(short.map(({ path, lang }) => ({ path, lang }))));
}
