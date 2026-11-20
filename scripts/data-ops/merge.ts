// Merge engine: every source adapter → one curated record per university.
//
//   npm run data:merge                 (= node --import tsx scripts/data-ops/merge.ts)
//   npm run data:merge -- --ai-review  (also writes data/curated/review-batch.json for an LLM worker)
//
// Re-runnable and deterministic: same inputs → byte-identical outputs (no wall-clock timestamps;
// "as_of" is the newest retrieved_at seen). New shard outputs are picked up by the glob adapters.
// Outputs (data/curated/): universities.ndjson (current view), history.ndjson, excluded.ndjson,
// conflicts.ndjson, rejects.ndjson, run-report.{md,json}, published-patch.json.
import { existsSync, readFileSync, renameSync } from "node:fs";
import { path, readJson, writeText } from "../ingest/lib";
import {
  nov14Merged, ocShards, programmesCostsNov14, programmesLatest, published, targetsLatest, wikidata, ipeds, type Adapter,
} from "./adapters";
import { scorecard, usHistory, loadInstitutionStatus, statusExclusion } from "./scorecard";
import { buildCountryStats, cds, courseDatasets, nov16b } from "./datasets";
import { CuratedRecord, FIELDS, TIMELESS_FIELDS, type FieldName, type Observation } from "./model";
import { crossChecks, rejectReasons, staleness, type CrossIssue } from "./gates";
import { duplicateGroups, IdentityIndex, loadIdentities, type Identity } from "./identity";
import { resolveField, type ConflictEntry, type HistoryEntry, type ResolvedFact } from "./resolve";
import { buildReviewBatch } from "./review";
import { trustOf } from "./confidence";
import { buildPublishedPatch } from "./patch";

export const ADAPTERS: Adapter[] = [ocShards, targetsLatest, nov14Merged, programmesLatest, programmesCostsNov14, published, scorecard, usHistory, ipeds, wikidata, cds, courseDatasets, nov16b];
const OUT = "data/curated";

/** Academic year (Aug–Jul) that contains a date: 2026-11-16 → 2026/27. */
export const academicYearOfDate = (day: string) => {
  const y = Number(day.slice(0, 4)), m = Number(day.slice(5, 7));
  const start = m >= 8 ? y : y - 1;
  return `${start}/${String((start + 1) % 100).padStart(2, "0")}`;
};

export interface Exclusion { id: string; name: string; country_code: string | null; reason: string; detail: string | null }

export async function runMerge(opts: { aiReview?: boolean; write?: boolean } = {}) {
  const ids = loadIdentities();
  const index = new IdentityIndex(ids);
  const targets = readJson<{ universities: { id: string }[] }>("data/segment/targets.json").universities.map((u) => u.id);
  const targetRank = new Map(targets.map((id, i) => [id, i + 1]));

  // ── 1. Adapters ──
  const perAdapter: Record<string, { inputs: string[]; observations: number; rejected: number; unmatched: number }> = {};
  const accepted: (Observation & { university_id: string; source_url: string; retrieved_at: string })[] = [];
  const rejects: { university_id: string | null; field: string; collector: string; input: string; reasons: string[]; value: unknown }[] = [];
  const unmatched = new Map<string, { collector: string; name: string | null; university_id: string | null }>();
  for (const a of ADAPTERS) {
    const obs = a.read({ scope: null });
    const stat = (perAdapter[a.name] = { inputs: a.inputs(), observations: obs.length, rejected: 0, unmatched: 0 });
    for (const o of obs) {
      const id = index.resolve(o);
      if (!id) { stat.unmatched++; unmatched.set(`${o.collector}|${o.university_id}|${o.name}`, { collector: o.collector, name: o.name ?? null, university_id: o.university_id }); continue; }
      const reasons = rejectReasons(o);
      if (reasons.length) { stat.rejected++; rejects.push({ university_id: id, field: o.field, collector: o.collector, input: o.input, reasons, value: o.value }); continue; }
      accepted.push({ ...o, university_id: id, source_url: o.source_url!, retrieved_at: o.retrieved_at! });
    }
  }
  const asOf = accepted.reduce((m, o) => (o.retrieved_at > m ? o.retrieved_at : m), "2000-01-01");

  // ── 2. Exclusions (hidden, reversible): duplicates, closed / non-bachelor US, overrides ──
  const excluded = new Map<string, Exclusion>();
  const canonicalOf = new Map<string, string>();
  const obsCount = new Map<string, number>();
  for (const o of accepted) obsCount.set(o.university_id, (obsCount.get(o.university_id) ?? 0) + 1);
  const dupGroups = duplicateGroups(ids);
  for (const g of dupGroups) {
    const score = (id: string) => [targetRank.has(id) ? 1 : 0, ids.get(id)!.rankings, obsCount.get(id) ?? 0] as const;
    const canon = [...g].sort((a, b) => { const sa = score(a), sb = score(b); for (let i = 0; i < 3; i++) if (sa[i] !== sb[i]) return sb[i] - sa[i]; return a < b ? -1 : 1; })[0];
    for (const id of g) if (id !== canon) {
      canonicalOf.set(id, canon);
      const i = ids.get(id)!;
      excluded.set(id, { id, name: i.name, country_code: i.country_code, reason: "duplicate", detail: `merged into ${canon} (${ids.get(canon)!.name}); shared ${sharedKey(i, ids.get(canon)!)}` });
    }
  }
  for (const o of accepted) if (canonicalOf.has(o.university_id)) o.university_id = canonicalOf.get(o.university_id)!;
  const status = await loadInstitutionStatus();
  for (const i of ids.values()) {
    if (excluded.has(i.id) || i.country_code !== "US" || !i.unitid) continue;
    const s = status.get(i.unitid);
    const reason = statusExclusion(s);
    if (reason && !targetRank.has(i.id)) excluded.set(i.id, { id: i.id, name: i.name, country_code: "US", reason, detail: `Scorecard UNITID ${i.unitid}: CURROPER=${s!.curroper}, PREDDEG=${s!.preddeg}, HIGHDEG=${s!.highdeg}` });
  }
  const overrides = existsSync(path(`${OUT}/overrides.json`)) ? readJson<{ keep?: string[]; exclude?: { id: string; reason: string }[] }>(`${OUT}/overrides.json`) : {};
  for (const e of overrides.exclude ?? []) { const i = ids.get(e.id); if (i) excluded.set(e.id, { id: e.id, name: i.name, country_code: i.country_code, reason: "manual", detail: e.reason }); }
  for (const id of overrides.keep ?? []) excluded.delete(id);

  // ── 3. Resolve per university × field ──
  const byUni = new Map<string, Map<FieldName, typeof accepted>>();
  for (const o of accepted) {
    const m = byUni.get(o.university_id) ?? new Map();
    m.set(o.field, [...(m.get(o.field) ?? []), o]);
    byUni.set(o.university_id, m);
  }
  const records: CuratedRecord[] = [];
  const historyLines: { id: string; name: string; entries: HistoryEntry[] }[] = [];
  const conflicts: (ConflictEntry & { university_id: string; name: string })[] = [];
  const validation: (CrossIssue & { university_id: string; name: string })[] = [];
  const mergedInto = new Map<string, string[]>();
  for (const [dup, canon] of canonicalOf) mergedInto.set(canon, [...(mergedInto.get(canon) ?? []), dup]);
  for (const ident of [...ids.values()].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    if (canonicalOf.has(ident.id)) continue;
    const fields = byUni.get(ident.id) ?? new Map();
    const facts: Record<string, ResolvedFact> = {};
    const alternatives: Record<string, ResolvedFact[]> = {};
    const history: HistoryEntry[] = [];
    const collectors = new Set<string>();
    for (const field of FIELDS) {
      const cands = fields.get(field);
      if (!cands?.length) continue;
      for (const c of cands) collectors.add(c.collector);
      const r = resolveField(field, cands);
      history.push(...r.history);
      conflicts.push(...r.conflicts.map((c) => ({ ...c, university_id: ident.id, name: ident.name })));
      if (r.alternatives.length) alternatives[field] = r.alternatives;
      if (r.fact) {
        const f = r.fact;
        if (!f.academic_year && !TIMELESS_FIELDS.includes(field)) { f.academic_year = academicYearOfDate(f.retrieved_at); f.flags = [...f.flags, "year-from-retrieval"].sort(); }
        if (staleness({ retrieved_at: f.retrieved_at, academic_year: null }, asOf).stale) f.flags = [...f.flags, "stale-retrieval"].sort();
        facts[field] = f;
      }
    }
    // Cross-source validation: penalise confidence, explain in basis, drop impossible values (logged as rejects).
    for (const issue of crossChecks(facts, [...fields.values()].flat(), history)) {
      validation.push({ ...issue, university_id: ident.id, name: ident.name });
      const f = facts[issue.field];
      if (issue.drop) for (const d of issue.drop) {
        if (!facts[d]) continue;
        rejects.push({ university_id: ident.id, field: d, collector: facts[d].collector, input: "cross-check", reasons: [`${issue.kind}: ${issue.detail}`], value: facts[d].value });
        delete facts[d];
      }
      else if (f) {
        f.confidence = Math.max(0, Math.round((f.confidence - issue.penalty) * 100) / 100);
        f.flags = [...new Set([...f.flags, `xcheck:${issue.kind}`])].sort();
        f.basis = `${f.basis ?? ""}; ${issue.detail}`.replace(/^; /, "");
      }
    }
    const merged = mergedInto.get(ident.id) ?? [];
    const aliases = [...new Set([...ident.aliases, ...merged.map((m) => ids.get(m)!.name)].filter((a) => a !== ident.name))].sort();
    const rec: CuratedRecord = {
      id: ident.id, slug: ident.slug, name: ident.name, country_code: ident.country_code, website: ident.website,
      is_target: targetRank.has(ident.id), target_rank: targetRank.get(ident.id) ?? null, facts, alternatives,
      aliases, merged_ids: merged, collectors: [...collectors].sort(),
    };
    if (!excluded.has(ident.id) && !ident.website && ident.rankings === 0 && !Object.keys(facts).length && !targetRank.has(ident.id))
      excluded.set(ident.id, { id: ident.id, name: ident.name, country_code: ident.country_code, reason: "empty", detail: "no website, no ranking, no facts" });
    records.push(rec);
    if (history.length) historyLines.push({ id: ident.id, name: ident.name, entries: history.sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : (a.academic_year ?? "") < (b.academic_year ?? "") ? -1 : 1)) });
  }
  const current = records.filter((r) => !excluded.has(r.id));
  for (const r of current) {
    const v = CuratedRecord.safeParse(r);
    if (!v.success) throw new Error(`curated record ${r.id} fails the model: ${v.error.issues[0].message}`);
  }
  const excludedRows = [...excluded.values()].sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((e) => ({ ...e, record: records.find((r) => r.id === e.id) ?? null }));

  // ── 4. Report ──
  const shown = validation.filter((v) => !excluded.has(v.university_id));
  const report = buildReport({ perAdapter, rejects, unmatched: [...unmatched.values()], excluded: [...excluded.values()], conflicts, current, historyLines, targets, asOf, accepted, dupGroups, validation: shown });
  const countryStats = buildCountryStats();

  if (opts.write !== false) {
    const nd = (rows: unknown[]) => rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
    const uniText = nd(current);
    const uniPath = path(`${OUT}/universities.ndjson`);
    if (existsSync(uniPath) && readFileSync(uniPath, "utf8") !== uniText) renameSync(uniPath, path(`${OUT}/universities.prev.ndjson`));
    writeText(`${OUT}/universities.ndjson`, uniText);
    writeText(`${OUT}/history.ndjson`, nd(historyLines.filter((h) => !excluded.has(h.id))));
    writeText(`${OUT}/excluded.ndjson`, nd(excludedRows));
    writeText(`${OUT}/conflicts.ndjson`, nd(conflicts.map(({ university_id, name, ...c }) => ({ university_id, name, ...c }))));
    writeText(`${OUT}/rejects.ndjson`, nd(rejects));
    writeText(`${OUT}/validation.ndjson`, nd(shown.map(({ university_id, name, ...v }) => ({ university_id, name, ...v }))));
    writeText(`${OUT}/country-stats.json`, JSON.stringify(countryStats, null, 1) + "\n");
    writeText(`${OUT}/run-report.json`, JSON.stringify(report.json, null, 1) + "\n");
    writeText(`${OUT}/run-report.md`, report.md);
    writeText(`${OUT}/published-patch.json`, JSON.stringify(buildPublishedPatch(current, excludedRows, canonicalOf, ids), null, 1) + "\n");
    if (opts.aiReview) writeText(`${OUT}/review-batch.json`, JSON.stringify(buildReviewBatch(conflicts), null, 1) + "\n");
  }
  return { current, excluded, conflicts, rejects, report: report.json };
}

function sharedKey(a: Identity, b: Identity) {
  if (a.unitid && a.unitid === b.unitid) return `IPEDS unitid ${a.unitid}`;
  if (a.ror && a.ror === b.ror) return `ROR ${a.ror}`;
  return `name + country + domain (${a.domains.find((d) => b.domains.includes(d)) ?? a.website})`;
}

// ── report ──
type Acc = Observation & { university_id: string };
function coverageOf(ids: string[], has: (id: string, f: FieldName) => boolean, fields: FieldName[]) {
  return Object.fromEntries(fields.map((f) => [f, ids.filter((id) => has(id, f)).length]));
}
export const REPORT_FIELDS: FieldName[] = ["tuition", "deadlines", "platform", "ielts", "toefl", "duolingo", "sat_act", "application_fee", "acceptance_rate", "documents", "programmes", "sat_scores", "bachelor_fields",
  "intl_aid", "applicants", "gpa_avg", "c7_factors", "room_board", "intl_students"];

function buildReport(x: {
  perAdapter: Record<string, { inputs: string[]; observations: number; rejected: number; unmatched: number }>;
  rejects: { reasons: string[]; field: string; collector: string }[]; unmatched: { collector: string; name: string | null }[];
  excluded: Exclusion[]; conflicts: ConflictEntry[]; current: CuratedRecord[]; historyLines: { entries: HistoryEntry[] }[];
  targets: string[]; asOf: string; accepted: Acc[]; dupGroups: string[][]; validation: CrossIssue[];
}) {
  const byId = new Map(x.current.map((r) => [r.id, r]));
  // Before = the best single research file for targets (targets-latest) / pre-refresh US values; current-year values only.
  const beforeTargets = new Set(x.accepted.filter((o) => /targets-latest/.test(o.input) && !staleness({ retrieved_at: null, academic_year: o.academic_year }, x.asOf).stale).map((o) => `${o.university_id}|${o.field}`));
  const us = x.current.filter((r) => r.country_code === "US").map((r) => r.id);
  const beforeUs = new Set(x.accepted.filter((o) => o.collector === "ipeds-pre-2026-11" || o.collector === "ipeds-2023").map((o) => `${o.university_id}|${o.field}`));
  const after = (id: string, f: FieldName) => !!byId.get(id)?.facts[f];
  const tIds = x.targets.filter((id) => byId.has(id));
  const exclusionCounts: Record<string, number> = {};
  for (const e of x.excluded) exclusionCounts[e.reason] = (exclusionCounts[e.reason] ?? 0) + 1;
  const rejectCounts: Record<string, number> = {};
  for (const r of x.rejects) for (const reason of r.reasons) { const k = reason.split(":")[0] + ": " + r.field; rejectCounts[k] = (rejectCounts[k] ?? 0) + 1; }
  const conflictCounts = { total: x.conflicts.length, tie: x.conflicts.filter((c) => c.status === "tie").length,
    by_rule: Object.fromEntries(["fetched>snippet", "newer-academic-year", "verified-dataset>research"].map((r) => [r, x.conflicts.filter((c) => c.rule === r).length])) };
  const historyReasons: Record<string, number> = {};
  for (const h of x.historyLines) for (const e of h.entries) { const k = e.reason.replace(/\(.*?\)/g, "").replace(/ to .*$/, "").trim(); historyReasons[k] = (historyReasons[k] ?? 0) + 1; }
  // Spot-check: 20 excluded examples, spread over reasons, evenly spaced.
  const spot: Exclusion[] = [];
  const reasons = Object.keys(exclusionCounts).sort();
  for (const reason of reasons) {
    const list = x.excluded.filter((e) => e.reason === reason).sort((a, b) => (a.name < b.name ? -1 : 1));
    const take = Math.max(1, Math.round((20 * list.length) / x.excluded.length));
    for (let i = 0; i < Math.min(take, list.length); i++) spot.push(list[Math.floor((i * list.length) / take)]);
  }
  const yearMix: Record<string, number> = {};
  for (const r of x.current) for (const f of Object.values(r.facts)) yearMix[f.academic_year ?? "timeless"] = (yearMix[f.academic_year ?? "timeless"] ?? 0) + 1;
  const validationCounts: Record<string, number> = {};
  for (const v of x.validation) validationCounts[`${v.severity} ${v.kind}`] = (validationCounts[`${v.severity} ${v.kind}`] ?? 0) + 1;
  const trust: Record<string, Record<string, number>> = {};
  for (const r of x.current.filter((r) => r.is_target)) for (const [f, fact] of Object.entries(r.facts)) {
    const t = trustOf(fact.confidence);
    (trust[f] ??= { verified: 0, likely: 0, check: 0 })[t]++;
  }
  const json = {
    as_of: x.asOf, validation: validationCounts, target_trust: Object.fromEntries(Object.entries(trust).sort()), adapters: x.perAdapter, universities: { current: x.current.length, excluded: x.excluded.length, targets_current: tIds.length },
    exclusions: exclusionCounts, duplicate_groups: x.dupGroups.length, rejects: { total: x.rejects.length, by_reason: rejectCounts },
    unmatched: x.unmatched.length, conflicts: conflictCounts, history: historyReasons,
    current_years: Object.fromEntries(Object.entries(yearMix).sort()),
    coverage: {
      targets: { total: tIds.length, before: coverageOf(tIds, (id, f) => beforeTargets.has(`${id}|${f}`), REPORT_FIELDS), after: coverageOf(tIds, after, REPORT_FIELDS) },
      us: { total: us.length, before: coverageOf(us, (id, f) => beforeUs.has(`${id}|${f}`), ["tuition", "acceptance_rate", "sat_scores", "act_scores"]), after: coverageOf(us, after, ["tuition", "acceptance_rate", "sat_scores", "act_scores"]) },
      all: { total: x.current.length, after: coverageOf(x.current.map((r) => r.id), after, REPORT_FIELDS) },
    },
    spot_check: spot.map((e) => ({ id: e.id, name: e.name, country_code: e.country_code, reason: e.reason, detail: e.detail })),
  };
  const t = json.coverage.targets;
  const md = [
    "# Curated data — merge run",
    "",
    `As of ${x.asOf} (newest retrieved_at). Built by \`scripts/data-ops/merge.ts\`. Current view = newest value per field, academic year 2026/27 preferred, else 2025/26; older years are history only.`,
    "",
    `- Universities in the current view: **${x.current.length}** (targets: ${tIds.length}/${x.targets.length})`,
    `- Hidden (excluded, reversible via \`data/curated/overrides.json\`): **${x.excluded.length}** — ${Object.entries(exclusionCounts).map(([k, v]) => `${k} ${v}`).join(", ")}`,
    `- Conflicts: **${conflictCounts.total}** — resolved ${conflictCounts.total - conflictCounts.tie} (${Object.entries(conflictCounts.by_rule).map(([k, v]) => `${k} ${v}`).join(", ")}), ties kept with both values ${conflictCounts.tie}`,
    `- Rejected values (dropped, university kept): **${x.rejects.length}**`,
    `- Observations that matched no catalogue university: ${x.unmatched.length}`,
    "",
    `- Cross-source validation: ${Object.entries(validationCounts).map(([k, v]) => `${k} ${v}`).join(", ") || "no issues"} (\`validation.ndjson\`)`,
    "",
    "## Inputs",
    "",
    "| Adapter | Files | Observations | Rejected | Unmatched |",
    "|---|---:|---:|---:|---:|",
    ...Object.entries(x.perAdapter).map(([k, v]) => `| ${k} | ${v.inputs.length} | ${v.observations} | ${v.rejected} | ${v.unmatched} |`),
    "",
    "## Coverage of the 204 targets (current-year values)",
    "",
    "| Field | Before (targets-latest only) | After merge |",
    "|---|---:|---:|",
    ...REPORT_FIELDS.map((f) => `| ${f} | ${t.before[f]} | ${t.after[f]} |`),
    "",
    `## US (${json.coverage.us.total} current records)`,
    "",
    "| Field | Before (IPEDS ≤2023/24) | After (Scorecard 2025/26 + research) |",
    "|---|---:|---:|",
    ...Object.keys(json.coverage.us.after).map((f) => `| ${f} | ${(json.coverage.us.before as Record<string, number>)[f]} | ${(json.coverage.us.after as Record<string, number>)[f]} |`),
    "",
    "## Trust of target facts (confidence: verified ≥ 0.85 · likely ≥ 0.6 · check < 0.6)",
    "",
    "| Field | verified | likely | check official site |",
    "|---|---:|---:|---:|",
    ...REPORT_FIELDS.filter((f) => trust[f]).map((f) => `| ${f} | ${trust[f].verified} | ${trust[f].likely} | ${trust[f].check} |`),
    "",
    "## Academic year of current values",
    "",
    ...Object.entries(json.current_years).map(([k, v]) => `- ${k}: ${v}`),
    "",
    "## Rejected values by reason",
    "",
    ...Object.entries(rejectCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`),
    "",
    "## History (kept, not shown)",
    "",
    ...Object.entries(historyReasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`),
    "",
    "## Excluded — spot check",
    "",
    "| University | Country | Reason | Detail |",
    "|---|---|---|---|",
    ...json.spot_check.map((e) => `| ${e.name} | ${e.country_code ?? ""} | ${e.reason} | ${e.detail ?? ""} |`),
    "",
  ].join("\n");
  return { json, md };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const res = await runMerge({ aiReview: process.argv.includes("--ai-review") });
  const r = res.report;
  console.log(JSON.stringify({ current: r.universities.current, excluded: r.exclusions, conflicts: r.conflicts, rejects: r.rejects.total, unmatched: r.unmatched }));
}
