#!/usr/bin/env node
// Data audit: reads the normalised data/v2/*.ndjson tables (built by scripts/ingest)
// plus the staged research shards, and reports freshness, impossible values,
// duplicates, missing sources and conflicts. Read-only.
//   node scripts/data-ops/audit.mjs            → writes data/curated/audit.md + audit-issues.json
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const read = (f) =>
  existsSync(f)
    ? readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
const unis = read("data/v2/universities.ndjson");
const costs = read("data/v2/costs.ndjson");
const adm = read("data/v2/admissions.ndjson");
const dls = read("data/v2/deadlines.ndjson");
const progs = read("data/v2/programmes.ndjson");
const sources = new Map(read("data/v2/sources.ndjson").map((s) => [s.id, s]));
const targets = new Set(JSON.parse(readFileSync("data/segment/targets.json", "utf8")).universities.map((u) => u.id || u.university_id));
const uniById = new Map(unis.map((u) => [u.id, u]));
const name = (id) => uniById.get(id)?.name || id;

const issues = [];
const add = (severity, kind, university_id, detail) =>
  issues.push({ severity, kind, university: name(university_id), university_id, target: targets.has(university_id), detail });

const yearOf = (s) => {
  const m = String(s ?? "").match(/(20\d\d)/);
  return m ? Number(m[1]) : null;
};
const CURRENT = 2025; // owner rule: 2025/26 or newer is current

// ---- Universities: duplicates, missing website
const byKey = new Map();
for (const u of unis) {
  const k = `${(u.name || "").toLowerCase().replace(/[^a-z0-9]/g, "")}|${u.country_code}`;
  (byKey.get(k) || byKey.set(k, []).get(k)).push(u);
  if (!u.website) add("low", "missing_website", u.id, "");
}
let dupGroups = 0;
for (const [, g] of byKey) if (g.length > 1) { dupGroups++; for (const u of g) add("medium", "duplicate_university", u.id, `${g.length} records share name+country`); }
const byDomain = new Map();
for (const u of unis) { const d = (u.website || "").replace(/^https?:\/\/(www\.)?/, "").split("/")[0].toLowerCase(); if (d) (byDomain.get(d) || byDomain.set(d, []).get(d)).push(u); }
let dupDomains = 0;
for (const [d, g] of byDomain) if (g.length > 1) { dupDomains++; for (const u of g) add("low", "shared_website", u.id, `${d} used by ${g.length} records`); }

// ---- Costs
const intlTuition = costs.filter((c) => c.category === "tuition");
let staleCosts = 0, futureOk = 0;
for (const c of intlTuition) {
  const y = yearOf(c.academic_year);
  if (y && y < CURRENT) { staleCosts++; if (targets.has(c.university_id)) add("medium", "stale_tuition", c.university_id, `${c.academic_year} ${c.student_category || ""}`); }
  if (y && y >= CURRENT) futureOk++;
  if (c.amount_usd != null && (c.amount_usd < 0 || c.amount_usd > 120000)) add("high", "tuition_out_of_range", c.university_id, `$${c.amount_usd}`);
  if (c.amount != null && c.amount_usd == null && c.currency !== "USD") add("low", "tuition_no_usd", c.university_id, `${c.amount} ${c.currency}`);
  if (!c.source_id || !sources.has(c.source_id)) add("high", "tuition_no_source", c.university_id, "");
}
// conflicts: same uni, same year, same category/student_category, amounts differ > 15%
const ck = new Map();
for (const c of intlTuition) { if (c.amount_usd == null) continue; const k = `${c.university_id}|${c.academic_year}|${c.student_category}`; (ck.get(k) || ck.set(k, []).get(k)).push(c.amount_usd); }
for (const [k, v] of ck) { if (v.length < 2) continue; const mn = Math.min(...v), mx = Math.max(...v); if (mx > mn * 1.15) add("medium", "tuition_conflict", k.split("|")[0], `${k.split("|").slice(1).join(" ")}: $${mn}–$${mx}`); }

// ---- Admissions
let staleAdm = 0;
for (const a of adm) {
  if (a.acceptance_rate != null && (a.acceptance_rate <= 0 || a.acceptance_rate > 100)) add("high", "acceptance_out_of_range", a.university_id, String(a.acceptance_rate));
  if (a.intake_year && a.intake_year < CURRENT - 1) staleAdm++;
  for (const f of ["ielts_min", "ielts_overall"]) if (a[f] != null && (a[f] < 4 || a[f] > 9)) add("high", "ielts_out_of_range", a.university_id, `${f}=${a[f]}`);
  if (a.sat_min != null && (a.sat_min < 400 || a.sat_min > 1600)) add("high", "sat_out_of_range", a.university_id, String(a.sat_min));
}

// ---- Deadlines
let pastDeadlines = 0, inferredYear = 0;
const today = new Date("2026-11-16");
for (const d of dls) {
  if (d.date) {
    const dt = new Date(d.date);
    if (isNaN(+dt)) add("medium", "deadline_bad_date", d.university_id, String(d.date));
    else if (dt < new Date("2025-09-01")) { pastDeadlines++; if (targets.has(d.university_id)) add("medium", "deadline_old_cycle", d.university_id, `${d.round || ""} ${d.date}`); }
  }
  if (d.provenance && JSON.stringify(d.provenance).includes("inferred")) inferredYear++;
}

// ---- Staged research shards (not yet merged): method quality
let shardRecs = 0, snippetVals = 0, fetchedVals = 0;
for (let i = 1; i <= 6; i++) {
  const f = `data/review/oc-shards/output-${i}.json`;
  if (!existsSync(f)) continue;
  const recs = JSON.parse(readFileSync(f, "utf8")).records || [];
  shardRecs += recs.length;
  for (const r of recs) for (const k of ["tuition", "deadlines", "platform", "english", "sat_act", "documents", "programmes"]) {
    const v = r[k]; if (!v || typeof v !== "object") continue;
    const hasVal = v.amount != null || (v.value != null && !(Array.isArray(v.value) && !v.value.length)) || v.ielts != null;
    if (!hasVal) continue;
    if (/snippet/i.test(v.method || "")) snippetVals++; else fetchedVals++;
    const y = yearOf(v.academic_year);
    if (k === "tuition" && y && y < CURRENT) add("medium", "shard_stale_tuition", r.id, `${r.name}: ${v.academic_year}`);
  }
}

// ---- Report
const count = (kind) => issues.filter((i) => i.kind === kind).length;
const kinds = [...new Set(issues.map((i) => i.kind))].sort((a, b) => count(b) - count(a));
const targetIssues = issues.filter((i) => i.target);
mkdirSync("data/curated", { recursive: true });
writeFileSync("data/curated/audit-issues.json", JSON.stringify(issues, null, 1));
const lines = [
  `# Data audit (${new Date().toISOString().slice(0, 10)})`,
  ``,
  `Universities: ${unis.length} · duplicate name+country groups: ${dupGroups} · shared website domains: ${dupDomains}`,
  `Tuition rows: ${intlTuition.length} · current (2025/26+): ${futureOk} · older than 2025: ${staleCosts}`,
  `Admissions rows: ${adm.length} · older than ${CURRENT - 1}: ${staleAdm}`,
  `Deadline rows: ${dls.length} · before Sep 2025 (old cycle): ${pastDeadlines} · year inferred: ${inferredYear}`,
  `Programmes rows: ${progs.length}`,
  `Staged research shards: ${shardRecs} records · values from search snippets: ${snippetVals} · from fetched pages/datasets: ${fetchedVals}`,
  ``,
  `## Issues by kind (all universities / targets)`,
  `| Kind | All | Targets |`,
  `|---|---:|---:|`,
  ...kinds.map((k) => `| ${k} | ${count(k)} | ${targetIssues.filter((i) => i.kind === k).length} |`),
  ``,
  `## Top target issues`,
  ...targetIssues.filter((i) => i.severity !== "low").slice(0, 40).map((i) => `- [${i.severity}] ${i.kind} · ${i.university} · ${i.detail}`),
];
writeFileSync("data/curated/audit.md", lines.join("\n") + "\n");
console.log(lines.join("\n"));
