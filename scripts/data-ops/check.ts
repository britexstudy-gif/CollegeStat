// Quality gates over the curated set + coverage dashboard.
//
//   npm run data:check   (= node --import tsx scripts/data-ops/check.ts)
//
// Reads data/curated/universities.ndjson (and universities.prev.ndjson for jump detection),
// writes data/curated/check-report.json and data/curated/coverage.md. Exit code 1 on hard errors
// (schema, range, missing source, a pre-2025/26 value in the current view).
import { existsSync, readFileSync } from "node:fs";
import { path, readJson, writeText } from "../ingest/lib";
import { CORE_FIELDS, CuratedRecord, FIELDS, type FieldName } from "./model";
import { rangeErrors, staleness } from "./gates";
import { DERIVED_CAP, trustOf } from "./confidence";
import { isHttp } from "./normalise";
import { REPORT_FIELDS } from "./merge";

type Fact = { value: any; source_url: string; retrieved_at: string; academic_year: string | null; flags: string[]; collector: string; method: string; confidence: number; basis?: string; derived?: boolean }; // eslint-disable-line @typescript-eslint/no-explicit-any
export const readNdjson = <T>(rel: string): T[] =>
  existsSync(path(rel)) ? readFileSync(path(rel), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as T) : [];

export interface Jump { id: string; name: string; field: string; from: unknown; to: unknown; why: string }

/** Suspicious changes vs the previous run. */
export function jumpsBetween(prev: CuratedRecord[], next: CuratedRecord[]): Jump[] {
  const before = new Map(prev.map((r) => [r.id, r]));
  const out: Jump[] = [];
  for (const r of next) {
    const p = before.get(r.id);
    if (!p) continue;
    const a = p.facts as Record<string, Fact>, b = r.facts as Record<string, Fact>;
    const push = (field: string, from: unknown, to: unknown, why: string) => out.push({ id: r.id, name: r.name, field, from, to, why });
    const ua = a.tuition?.value?.usd, ub = b.tuition?.value?.usd;
    if (ua && ub && Math.abs(ub - ua) / ua > 0.25) push("tuition", ua, ub, `tuition USD changed ${Math.round(((ub - ua) / ua) * 100)}%`);
    if (a.tuition && !b.tuition) push("tuition", ua ?? a.tuition.value?.amount, null, "tuition disappeared");
    const ia = a.ielts?.value?.overall, ib = b.ielts?.value?.overall;
    if (ia != null && ib != null && Math.abs(ib - ia) >= 1) push("ielts", ia, ib, "IELTS overall moved by ≥1 band");
    const pa = a.acceptance_rate?.value?.percent, pb = b.acceptance_rate?.value?.percent;
    if (pa != null && pb != null && Math.abs(pb - pa) > 15) push("acceptance_rate", pa, pb, "acceptance rate moved by >15 points");
    if (a.platform && b.platform && a.platform.value.code !== b.platform.value.code) push("platform", a.platform.value.code, b.platform.value.code, "platform changed");
  }
  return out;
}

export function checkRecords(records: CuratedRecord[], asOf: string) {
  const errors: { id: string; name: string; field?: string; error: string }[] = [];
  const warnings: { id: string; name: string; field: string; warning: string }[] = [];
  for (const r of records) {
    const v = CuratedRecord.safeParse(r);
    if (!v.success) errors.push({ id: r.id, name: r.name, error: `schema: ${v.error.issues[0].path.join(".")} ${v.error.issues[0].message}` });
    for (const [field, f] of Object.entries(r.facts as Record<string, Fact>)) {
      if (!isHttp(f.source_url) || !f.retrieved_at) errors.push({ id: r.id, name: r.name, field, error: "missing source" });
      for (const e of rangeErrors(field as FieldName, f.value)) errors.push({ id: r.id, name: r.name, field, error: e });
      const s = staleness({ retrieved_at: f.retrieved_at, academic_year: f.academic_year }, asOf);
      if (s.reasons.some((x) => x.includes("academic year"))) errors.push({ id: r.id, name: r.name, field, error: s.reasons.join("; ") + " — must not be in the current view" });
      else if (s.stale) warnings.push({ id: r.id, name: r.name, field, warning: s.reasons.join("; ") });
      if (f.flags.includes("conflict-tie")) warnings.push({ id: r.id, name: r.name, field, warning: "conflict tie: two values kept, needs review" });
      if (!f.basis) errors.push({ id: r.id, name: r.name, field, error: "trust: fact has no basis" });
      if (f.derived && f.confidence > DERIVED_CAP) errors.push({ id: r.id, name: r.name, field, error: `trust: derived value with confidence ${f.confidence} > ${DERIVED_CAP}` });
      if (f.method === "snippet" && f.confidence >= 0.85) errors.push({ id: r.id, name: r.name, field, error: "trust: snippet-only value marked verified" });
      for (const x of f.flags.filter((x) => x.startsWith("xcheck:"))) warnings.push({ id: r.id, name: r.name, field, warning: `cross-check ${x.slice(7)} — ${f.basis?.split("; ").pop() ?? ""}` });
    }
    const fa = r.facts as Record<string, Fact>;
    if (fa.applicants && fa.admitted && fa.applicants.academic_year === fa.admitted.academic_year && fa.admitted.value.value > fa.applicants.value.value)
      errors.push({ id: r.id, name: r.name, field: "admitted", error: `impossible: admitted ${fa.admitted.value.value} > applicants ${fa.applicants.value.value}` });
  }
  return { errors, warnings };
}

function main() {
  const records = readNdjson<CuratedRecord>("data/curated/universities.ndjson");
  if (!records.length) throw new Error("data/curated/universities.ndjson is empty — run npm run data:merge first");
  const prev = readNdjson<CuratedRecord>("data/curated/universities.prev.ndjson");
  const run = existsSync(path("data/curated/run-report.json")) ? readJson<any>("data/curated/run-report.json") : null; // eslint-disable-line @typescript-eslint/no-explicit-any
  const asOf = run?.as_of ?? new Date().toISOString().slice(0, 10);
  const { errors, warnings } = checkRecords(records, asOf);
  const jumps = jumpsBetween(prev, records);
  const targets = records.filter((r) => r.is_target).sort((a, b) => (a.target_rank ?? 0) - (b.target_rank ?? 0));
  const count = (list: CuratedRecord[], f: FieldName) => list.filter((r) => r.facts[f]).length;
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");
  const snippetOnly = (list: CuratedRecord[], f: FieldName) => list.filter((r) => (r.facts[f] as Fact | undefined)?.method === "snippet").length;
  const coreComplete = targets.filter((r) => CORE_FIELDS.every((f) => r.facts[f])).length;
  const verifiedOf = (list: CuratedRecord[], f: FieldName) => list.filter((r) => r.facts[f] && trustOf((r.facts[f] as Fact).confidence) === "verified").length;
  const byCountry = new Map<string, CuratedRecord[]>();
  for (const r of targets) byCountry.set(r.country_code ?? "?", [...(byCountry.get(r.country_code ?? "?") ?? []), r]);

  const md = [
    "# Curated coverage",
    "",
    `Generated by \`scripts/data-ops/check.ts\` from \`data/curated/universities.ndjson\` (as of ${asOf}). Current view only: newest value per field, academic year 2026/27 preferred, else 2025/26; older years live in \`history.ndjson\`.`,
    "",
    `Gates: **${errors.length} errors**, ${warnings.length} warnings, ${jumps.length} suspicious jumps vs the previous run.`,
    "",
    `## 204 targets — ${coreComplete} have every core field (${CORE_FIELDS.join(", ")})`,
    "",
    "| Field | Before merge | After merge | Share | verified (conf ≥ 0.85) | of which snippet-only (verify) |",
    "|---|---:|---:|---:|---:|---:|",
    ...REPORT_FIELDS.map((f) => `| ${f} | ${run?.coverage?.targets?.before?.[f] ?? "–"} | ${count(targets, f)} | ${pct(count(targets, f), targets.length)} | ${verifiedOf(targets, f)} | ${snippetOnly(targets, f)} |`),
    "",
    "## Targets by country (core fields present / universities)",
    "",
    "| Country | Universities | " + CORE_FIELDS.join(" | ") + " |",
    "|---|---:|" + CORE_FIELDS.map(() => "---:").join("|") + "|",
    ...[...byCountry].sort((a, b) => b[1].length - a[1].length).map(([c, list]) => `| ${c} | ${list.length} | ${CORE_FIELDS.map((f) => count(list, f)).join(" | ")} |`),
    "",
    `## All curated universities (${records.length})`,
    "",
    "| Field | Universities | Share |",
    "|---|---:|---:|",
    ...FIELDS.map((f) => `| ${f} | ${count(records, f)} | ${pct(count(records, f), records.length)} |`),
    "",
    "## Latest-data rule",
    "",
    "Academic year of the values in the current view (older years are excluded and kept as history):",
    "",
    ...Object.entries(run?.current_years ?? {}).map(([k, v]) => `- ${k}: ${v}`),
    "",
    ...Object.entries(run?.history ?? {}).map(([k, v]) => `- history — ${k}: ${v}`),
    "",
    "## Hidden universities",
    "",
    ...Object.entries(run?.exclusions ?? {}).map(([k, v]) => `- ${k}: ${v}`),
    "",
    "## Gate results",
    "",
    ...(errors.length ? errors.slice(0, 30).map((e) => `- ERROR ${e.name} ${e.field ?? ""}: ${e.error}`) : ["- no errors"]),
    ...summarise(warnings.map((w) => w.warning.split(" — ")[0].replace(/\d{4}-\d{2}-\d{2}/g, "…"))),
    ...jumps.slice(0, 30).map((j) => `- JUMP ${j.name} ${j.field}: ${JSON.stringify(j.from)} → ${JSON.stringify(j.to)} (${j.why})`),
    "",
  ].join("\n");
  writeText("data/curated/coverage.md", md);
  writeText("data/curated/check-report.json", JSON.stringify({ as_of: asOf, errors, warnings: warnings.length, warning_kinds: Object.fromEntries(countBy(warnings.map((w) => w.warning.split(":")[0]))), jumps }, null, 1) + "\n");
  console.log(JSON.stringify({ records: records.length, errors: errors.length, warnings: warnings.length, jumps: jumps.length }));
  if (errors.length) process.exitCode = 1;
}
const countBy = (xs: string[]) => { const m = new Map<string, number>(); for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1]); };
const summarise = (xs: string[]) => countBy(xs).slice(0, 10).map(([k, n]) => `- warning (${n}): ${k}`);

if (import.meta.url === `file://${process.argv[1]}`) main();
