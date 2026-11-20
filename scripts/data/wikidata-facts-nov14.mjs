#!/usr/bin/env node
/**
 * Pulls open structured facts (Wikidata, CC0) for catalogue universities.
 *
 * Matching: ROR id (P6782) first; otherwise the official website domain (P856)
 * with the same registrable host. Never matched on name. The catalogue's own
 * Wikidata id (when it has one) is only used to count agreement, not to match.
 *
 * Facts: students P2196, employees P1128, teachers P10610, inception P571,
 * instance of P31, affiliation P1416, motto P1451, area P2046, coordinates
 * P625, website P856, endowment P6589. Wikidata has no usable "number of
 * faculties" property, so none is pulled. Logos are never taken.
 *
 * Polite use: batched SPARQL, User-Agent "CollegeStatBot/1.0", a pause between
 * requests, retries with back-off and an on-disk cache keyed by query.
 *
 * Output:
 *   data/published/wikidata-facts-nov14.json              (everything + coverage)
 *   data/published/wikidata-facts-nov14-shards/NN.json    (per-university lookups, 64 shards)
 *
 * Usage: node scripts/data/wikidata-facts-nov14.mjs [--limit N] [--no-network]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const catalogueDir = join(root, "data/generated/catalogue");
const cacheDir = join(root, ".cache/wikidata-nov14");
const out = join(root, "data/published/wikidata-facts-nov14.json");
const shardDir = join(root, "data/published/wikidata-facts-nov14-shards");
const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "CollegeStatBot/1.0";
const args = process.argv.slice(2);
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;
const offline = args.includes("--no-network");
mkdirSync(cacheDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function sparql(query) {
  const key = createHash("sha1").update(query).digest("hex");
  const file = join(cacheDir, key + ".json");
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  if (offline) throw new Error("not cached (offline)");
  for (let attempt = 0; attempt < 6; attempt++) {
    await sleep(1200);
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "User-Agent": UA, Accept: "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ query }),
      });
    } catch (e) {
      console.warn("  network error, retrying:", e.cause?.code || e.message);
      await sleep(10000 * (attempt + 1));
      continue;
    }
    if (res.ok) {
      const json = await res.json();
      writeFileSync(file, JSON.stringify(json));
      return json;
    }
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || 5000 * (attempt + 1);
      console.warn(`  ${res.status}, waiting ${wait}ms`);
      await sleep(wait);
      continue;
    }
    throw new Error("SPARQL " + res.status + " " + (await res.text()).slice(0, 200));
  }
  throw new Error("SPARQL gave up");
}
const chunks = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, (i + 1) * n));
const qidOf = (uri) => uri.slice(uri.lastIndexOf("/") + 1);

// ── Catalogue ────────────────────────────────────────────────────────────
const catalogue = [];
for (const f of readdirSync(catalogueDir).filter((n) => /^shard-\d+\.json$/.test(n))) {
  for (const r of Object.values(JSON.parse(readFileSync(join(catalogueDir, f), "utf8")))) {
    const ids = r.identifiers || {};
    const pick = (s) => (typeof ids[s] === "string" ? ids[s] : null);
    const ror = (pick("ror") || "").replace(/^https?:\/\/ror\.org\//, "").toLowerCase() || null;
    catalogue.push({ id: r.id, slug: r.slug, website: r.website || null, ror, catalogueQid: pick("wikidata") });
  }
}
catalogue.sort((a, b) => (a.id < b.id ? -1 : 1));
const universities = catalogue.slice(0, Number.isFinite(limit) ? limit : undefined);
console.log("catalogue", universities.length);

const hostOf = (url) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};
// Shared hosts that identify no single institution.
const genericHost = /^(facebook|instagram|linkedin|youtube|twitter|x)\.com$|\.(gov|edu)\.[a-z]{2}$|^(gov|edu)\.[a-z]{2}$/;

// ── Step A: match to a Wikidata item ─────────────────────────────────────
const match = new Map(); // catalogue id -> { qid, by }
const byRor = new Map();
for (const u of universities) if (u.ror) byRor.set(u.ror, u);
let n = 0;
const rorBatches = chunks([...byRor.keys()], 350);
for (const batch of rorBatches) {
  const q = `SELECT ?item ?ror WHERE { VALUES ?ror { ${batch.map((r) => JSON.stringify(r)).join(" ")} } ?item wdt:P6782 ?ror }`;
  const res = await sparql(q);
  const seen = new Map();
  for (const b of res.results.bindings) {
    const r = b.ror.value.toLowerCase();
    seen.set(r, [...(seen.get(r) || []), qidOf(b.item.value)]);
  }
  // An ROR id shared by two items is ambiguous; skip it rather than guess.
  for (const [r, qids] of seen) if (qids.length === 1) match.set(byRor.get(r).id, { qid: qids[0], by: "ror" });
  console.log(`ror batch ${++n}/${rorBatches.length}`, match.size);
}
// Domain fallback for the rest.
const unmatched = universities.filter((u) => !match.has(u.id) && hostOf(u.website) && !genericHost.test(hostOf(u.website)));
const byHost = new Map();
for (const u of unmatched) byHost.set(hostOf(u.website), [...(byHost.get(hostOf(u.website)) || []), u]);
n = 0;
const hostBatches = chunks([...byHost.keys()], 120);
for (const batch of hostBatches) {
  const urls = batch.flatMap((h) => ["http://", "https://", "http://www.", "https://www."].flatMap((p) => [p + h, p + h + "/"]));
  const q = `SELECT ?item ?url WHERE { VALUES ?url { ${urls.map((x) => `<${x}>`).join(" ")} } ?item wdt:P856 ?url }`;
  const res = await sparql(q);
  const seen = new Map();
  for (const b of res.results.bindings) {
    const h = hostOf(b.url.value);
    seen.set(h, new Set([...(seen.get(h) || []), qidOf(b.item.value)]));
  }
  for (const [h, qids] of seen) {
    if (qids.size !== 1) continue; // two items claim the same site: ambiguous
    const us = byHost.get(h) || [];
    if (us.length !== 1) continue; // two catalogue records share a host: ambiguous
    match.set(us[0].id, { qid: [...qids][0], by: "website" });
  }
  console.log(`host batch ${++n}/${hostBatches.length}`, match.size);
}
// One item may belong to one catalogue record only.
const owners = new Map();
for (const [id, m] of match) owners.set(m.qid, [...(owners.get(m.qid) || []), id]);
for (const ids of owners.values()) if (ids.length > 1) for (const id of ids) match.delete(id);

// ── Step B: statements ───────────────────────────────────────────────────
const props = ["P2196", "P1128", "P10610", "P571", "P31", "P1416", "P1451", "P2046", "P625", "P856", "P6589"];
const triples = props.map((p) => `(p:${p} ps:${p} psv:${p})`).join(" ");
const qids = [...new Set([...match.values()].map((m) => m.qid))];
const raw = new Map(); // qid -> prop -> rows
n = 0;
const factBatches = chunks(qids, 120);
for (const batch of factBatches) {
  const q = `SELECT ?item ?p ?v ?vl ?date ?prec ?unit ?unitl ?rank WHERE {
  VALUES ?item { ${batch.map((x) => "wd:" + x).join(" ")} }
  VALUES (?p ?ps ?psv) { ${triples} }
  ?item ?p ?st . ?st ?ps ?v .
  OPTIONAL { ?st wikibase:rank ?rank }
  OPTIONAL { ?st pq:P585 ?date }
  OPTIONAL { ?st ?psv ?node . OPTIONAL { ?node wikibase:quantityUnit ?unit . ?unit rdfs:label ?unitl FILTER(lang(?unitl) = "en") } OPTIONAL { ?node wikibase:timePrecision ?prec } }
  OPTIONAL { ?v rdfs:label ?vl FILTER(lang(?vl) = "en") }
}`;
  const res = await sparql(q);
  for (const b of res.results.bindings) {
    if (b.rank?.value.endsWith("DeprecatedRank")) continue;
    const item = qidOf(b.item.value);
    const p = qidOf(b.p.value);
    const rows = raw.get(item) || new Map();
    rows.set(p, [...(rows.get(p) || []), b]);
    raw.set(item, rows);
  }
  console.log(`fact batch ${++n}/${factBatches.length}`);
}

// ── Build records ────────────────────────────────────────────────────────
const stmtUrl = (qid, p) => `https://www.wikidata.org/wiki/${qid}#${p}`;
const day = (d) => (d ? d.value.slice(0, 10) : null);
const num = (b) => Number(b.v.value);
// Latest dated statement wins; undated ones rank below dated ones; preferred rank first.
const best = (rows) =>
  [...rows].sort((a, b) => {
    const pr = (x) => (x.rank?.value.endsWith("PreferredRank") ? 1 : 0);
    return pr(b) - pr(a) || (day(b.date) || "").localeCompare(day(a.date) || "");
  })[0];
const quantity = (qid, p, rows, min = 1, max = Infinity) => {
  const ok = (rows || []).filter((b) => Number.isFinite(num(b)) && num(b) >= min && num(b) <= max);
  if (!ok.length) return null;
  const b = best(ok);
  return { value: num(b), date: day(b.date), qid, property: p, source_url: stmtUrl(qid, p) };
};
const uniq = (xs) => [...new Set(xs)];
const records = {};
const matchedBy = { ror: 0, website: 0 };
let agree = 0;
let disagree = 0;
const bySlug = new Map(universities.map((u) => [u.id, u]));
for (const [id, m] of match) {
  const u = bySlug.get(id);
  const rows = raw.get(m.qid);
  if (!rows) continue;
  const r = { slug: u.slug, qid: m.qid, matched_by: m.by };
  if (u.catalogueQid) {
    if (u.catalogueQid === m.qid) agree++;
    else {
      // The catalogue's own Wikidata id points elsewhere: the identifiers conflict, so no facts are used.
      disagree++;
      continue;
    }
  }

  const students = quantity(m.qid, "P2196", rows.get("P2196"), 50, 2_000_000);
  if (students) r.students = students;
  const employees = quantity(m.qid, "P1128", rows.get("P1128"), 5, 500_000);
  if (employees) r.employees = employees;
  const teachers = quantity(m.qid, "P10610", rows.get("P10610"), 5, 200_000);
  if (teachers) r.academic_staff = teachers;

  const inception = rows.get("P571")?.filter((b) => /^-?\d{4}/.test(b.v.value));
  if (inception?.length) {
    const b = [...inception].sort((a, c) => a.v.value.localeCompare(c.v.value))[0]; // earliest founding statement
    const year = Number(b.v.value.slice(0, 4));
    // Precision 9 = year or finer. Century/decade-precise dates are not a year.
    if (year > 600 && year <= 2026 && (!b.prec || Number(b.prec.value) >= 9))
      r.founded = { year, date: b.v.value.slice(0, 10), qid: m.qid, property: "P571", source_url: stmtUrl(m.qid, "P571") };
  }

  const labelled = (p) => uniq((rows.get(p) || []).filter((b) => b.vl && !/^Q\d+$/.test(b.vl.value)).map((b) => b.vl.value));
  const types = labelled("P31");
  if (types.length) r.types = { value: types.slice(0, 4), qid: m.qid, property: "P31", source_url: stmtUrl(m.qid, "P31") };
  const aff = labelled("P1416");
  if (aff.length) r.affiliations = { value: aff.slice(0, 4), qid: m.qid, property: "P1416", source_url: stmtUrl(m.qid, "P1416") };

  const mottos = (rows.get("P1451") || []).filter((b) => b.v["xml:lang"] && b.v.value.trim().length >= 3 && b.v.value.length <= 140);
  if (mottos.length) {
    const b = mottos.find((x) => x.v["xml:lang"] === "en") || mottos[0];
    r.motto = { value: b.v.value.trim(), lang: b.v["xml:lang"], qid: m.qid, property: "P1451", source_url: stmtUrl(m.qid, "P1451") };
  }

  const area = (rows.get("P2046") || []).filter((b) => Number.isFinite(num(b)) && num(b) > 0 && b.unitl);
  if (area.length) {
    const b = best(area);
    const factor = { "square kilometre": 1, hectare: 0.01, "square metre": 1e-6, acre: 0.00404686, "square mile": 2.58999, "square foot": 9.2903e-8 }[b.unitl.value];
    const km2 = factor ? num(b) * factor : null;
    if (km2 && km2 >= 0.005 && km2 <= 500) r.campus_area = { value_km2: Math.round(km2 * 1000) / 1000, date: day(b.date), qid: m.qid, property: "P2046", source_url: stmtUrl(m.qid, "P2046") };
  }

  const coords = (rows.get("P625") || []).map((b) => /Point\(([-\d.e]+) ([-\d.e]+)\)/.exec(b.v.value)).filter(Boolean);
  if (coords.length) {
    const lon = Number(coords[0][1]);
    const lat = Number(coords[0][2]);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat || lon))
      r.coordinates = { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5, qid: m.qid, property: "P625", source_url: stmtUrl(m.qid, "P625") };
  }

  const site = (rows.get("P856") || []).find((b) => /^https?:\/\//.test(b.v.value));
  if (site) r.website = { value: site.v.value, qid: m.qid, property: "P856", source_url: stmtUrl(m.qid, "P856") };

  const endow = (rows.get("P6589") || []).filter((b) => Number.isFinite(num(b)) && num(b) > 0 && b.unitl);
  if (endow.length) {
    const b = best(endow);
    const code = { "United States dollar": "USD", euro: "EUR", "pound sterling": "GBP", "Canadian dollar": "CAD", "Australian dollar": "AUD", "Swiss franc": "CHF", "Japanese yen": "JPY", "renminbi": "CNY", "Hong Kong dollar": "HKD", "Singapore dollar": "SGD", "South Korean won": "KRW", "Swedish krona": "SEK", "Danish krone": "DKK", "Norwegian krone": "NOK", "New Zealand dollar": "NZD" }[b.unitl.value];
    if (code) r.endowment = { amount: num(b), currency: code, date: day(b.date), qid: m.qid, property: "P6589", source_url: stmtUrl(m.qid, "P6589") };
  }

  matchedBy[m.by]++;
  records[u.id] = r;
}

// ── Coverage ─────────────────────────────────────────────────────────────
const fields = ["students", "employees", "academic_staff", "founded", "types", "affiliations", "motto", "campus_area", "coordinates", "website", "endowment"];
const coverage = {
  catalogue_universities: universities.length,
  matched: Object.keys(records).length,
  matched_by: matchedBy,
  catalogue_qid_agrees: agree,
  catalogue_qid_disagrees_skipped: disagree,
  not_available: ["number of faculties (no Wikidata property)"],
  fields: Object.fromEntries(fields.map((f) => {
    const count = Object.values(records).filter((r) => r[f]).length;
    return [f, { count, pct_of_catalogue: Math.round((count / universities.length) * 1000) / 10 }];
  })),
};
console.log(JSON.stringify(coverage, null, 1));

const generated = new Date().toISOString().slice(0, 10);
writeFileSync(out, JSON.stringify({ generated_at: generated, source: "Wikidata (CC0) via query.wikidata.org", user_agent: UA, coverage, records }));

// Per-university shards: the profile page reads one small file, never the whole set.
if (existsSync(shardDir)) rmSync(shardDir, { recursive: true });
mkdirSync(shardDir, { recursive: true });
const shards = Array.from({ length: 64 }, () => ({}));
for (const [id, r] of Object.entries(records)) shards[parseInt(id.slice(0, 2), 16) % 64][id] = r;
shards.forEach((s, i) => writeFileSync(join(shardDir, String(i).padStart(2, "0") + ".json"), JSON.stringify(s)));
console.log("wrote", out);
