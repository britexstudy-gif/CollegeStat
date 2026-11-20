// Official-dataset adapters added Nov 2026:
//   • Common Data Set (data/review/cds-*.json)                — per-university admissions, tests, costs, intl aid
//   • CRICOS (AU) + DUO (NL) course lists (datasets-nov16.json) — bachelor programmes; CRICOS tuition estimate per year
//   • Round-2 national datasets (datasets-nov16b.json)        — university metrics + country-level origin stats
// Every reader skips missing / malformed fields: the collectors are still writing these files.
import { existsSync, readdirSync } from "node:fs";
import { num, path, readJson, str } from "../ingest/lib";
import { observe, type Adapter, type Base } from "./adapters";
import { C7_LEVELS, INTAKE, type FieldValue, type Observation } from "./model";
import { academicYear, deadlineAcademicYear, deadlinesOf, isoDayOf, satActOf, toUsd } from "./normalise";

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const exists = (rel: string) => existsSync(path(rel));
const glob = (dir: string, re: RegExp) => (exists(dir) ? readdirSync(path(dir)).filter((f) => re.test(f)).sort().map((f) => `${dir}/${f}`) : []);
const recs = (d: unknown): Any[] => (Array.isArray(d) ? d : Array.isArray((d as Any)?.records) ? (d as Any).records : []);
/** "https://data.gov.au/x (CRICOS Courses.csv, …)" → "https://data.gov.au/x". */
export const firstUrl = (v: unknown) => { const m = /https?:\/\/\S+/.exec(str(v) ?? ""); return m ? m[0].replace(/[),.;]+$/, "") : null; };
const push = (out: Observation[], o: Observation | null) => { if (o) out.push(o as Observation); };
const usdMoney = (v: unknown) => (num(v) != null && num(v)! >= 0 ? { amount: num(v)!, currency: "USD", usd: Math.round(num(v)!), text: null } : null);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// ── Common Data Set ──
const C7_MAP: Record<string, (typeof C7_LEVELS)[number]> = { "very important": "very_important", "very_important": "very_important", important: "important", considered: "considered", "not considered": "not_considered", "not_considered": "not_considered" };
export function c7Of(raw: unknown): FieldValue<"c7_factors"> | null {
  if (!raw || typeof raw !== "object") return null;
  const entries: [string, unknown][] = Array.isArray(raw)
    ? raw.map((x: Any) => [str(x?.factor) ?? str(x?.name) ?? "", x?.importance ?? x?.level ?? x?.value])
    : Object.entries(raw as Any);
  const out: Record<string, (typeof C7_LEVELS)[number]> = {};
  for (const [k, v] of entries) {
    const key = k.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const level = C7_MAP[String(v ?? "").toLowerCase().replace(/_/g, " ").trim()] ?? C7_MAP[String(v ?? "").toLowerCase().trim()];
    if (key && level) out[key] = level;
  }
  return Object.keys(out).length ? out : null;
}

const ROUND_OF: [RegExp, string][] = [
  [/^(ed2|ed_?ii|early_?decision_?(2|ii))/, "Early Decision II"], [/^(ed|early_?decision)/, "Early Decision"],
  [/^(rea|scea|restrictive)/, "Restrictive Early Action"], [/^(ea|early_?action)/, "Early Action"],
  [/^(rd|regular|regular_?decision)/, "Regular Decision"], [/^priority/, "Priority"], [/^rolling/, "Rolling"],
];
/** CDS C21/C22 {ea_close: "11/1", ED: "2025-11-01", rd: "January 2"} → deadline items for the entry the CDS describes. */
export function cdsDeadlines(raw: unknown, intake: number, prov: { source_url: string; retrieved_at: string }): FieldValue<"deadlines"> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const items: Any[] = [];
  for (const [k, v] of Object.entries(raw as Any)) {
    const key = k.toLowerCase();
    if (/notif|reply|release|decision_date|response/.test(key)) continue;
    const round = ROUND_OF.find(([re]) => re.test(key))?.[1];
    const text = str(v) ?? (typeof v === "object" && v ? str((v as Any).close ?? (v as Any).date) : null);
    if (!round || !text) continue;
    const md = /^(\d{1,2})\/(\d{1,2})$/.exec(text);
    const date = md ? `${Number(md[1]) >= 7 ? intake - 1 : intake}-${md[1].padStart(2, "0")}-${md[2].padStart(2, "0")}` : text;
    items.push({ round, date, cycle: `${intake} entry`, inferred: !!md });
  }
  const inferred = new Set(items.filter((i) => i.inferred).map((i) => i.round));
  return deadlinesOf(items, { ...prov, method: "dataset", collector: "cds" }).map((d) => (inferred.has(d.label) ? { ...d, date_inferred: true } : d));
}

export function cdsObservations(r: Any, file: string, fallbackDay: string | null): Observation[] {
  const out: Observation[] = [];
  const ay = academicYear(r.cds_year ?? r.academic_year);
  const start = ay ? Number(ay.slice(0, 4)) : null;
  const b: Base = { university_id: str(r.university_id) ?? str(r.id), name: r.name, country_code: "US", collector: "cds", input: file, verified: true, defaultMethod: "dataset" };
  const src = { source_url: firstUrl(r.source_url), retrieved_at: r.retrieved_at ?? fallbackDay, method: "dataset", note: str(r.cds_note) ?? (start ? `Common Data Set ${r.cds_year}` : null) };
  const opt = { academic_year: ay };
  const count = (v: unknown) => (num(v) != null && num(v)! >= 0 ? { value: num(v)!, year: start } : null);
  push(out, observe(b, "applicants", count(r.applicants), src, opt));
  push(out, observe(b, "admitted", count(r.admitted), src, opt));
  let rate = num(r.admit_rate);
  const computed = num(r.applicants) && num(r.admitted) != null ? (num(r.admitted)! / num(r.applicants)!) * 100 : null;
  if (rate != null && rate <= 1 && computed != null && computed > 1.5) rate = rate * 100; // fraction instead of percent
  if (rate != null) push(out, observe(b, "acceptance_rate", { percent: Math.round(rate * 100) / 100, year: start }, src, opt));
  else if (computed != null) push(out, observe(b, "acceptance_rate", { percent: Math.round(computed * 100) / 100, year: start }, src, { ...opt, derived: true, flags: ["computed-admitted/applicants"] }));
  const pick = (...keys: string[]) => keys.map((k) => num(r[k])).find((v) => v != null) ?? null;
  const sat = {
    reading_25: pick("sat_ebrw_25", "sat_erw_25", "sat_reading_25"), reading_75: pick("sat_ebrw_75", "sat_erw_75", "sat_reading_75"),
    math_25: pick("sat_math_25"), math_75: pick("sat_math_75"), average: null,
    composite_25: pick("sat_composite_25", "sat_total_25"), composite_50: pick("sat_composite_50", "sat_total_50"), composite_75: pick("sat_composite_75", "sat_total_75"),
  };
  if (Object.values(sat).some((v) => v != null)) push(out, observe(b, "sat_scores", sat, src, opt));
  const act = { p25: pick("act_composite_25", "act_25"), p75: pick("act_composite_75", "act_75") };
  if (act.p25 != null || act.p75 != null) push(out, observe(b, "act_scores", act, src, opt));
  const policy = str(r.test_policy);
  if (policy) push(out, observe(b, "sat_act", satActOf(policy.replace(/_/g, " ")), src, opt));
  const gpa = num(r.gpa_avg);
  if (gpa != null && gpa > 0) push(out, observe(b, "gpa_avg", gpa, src, opt));
  push(out, observe(b, "c7_factors", c7Of(r.c7_factors), src, opt));
  push(out, observe(b, "application_fee", usdMoney(r.application_fee), src, opt));
  if (r.deadlines && start) {
    const items = cdsDeadlines(r.deadlines, start + 1, { source_url: src.source_url ?? "", retrieved_at: isoDayOf(src.retrieved_at) ?? "" });
    push(out, observe(b, "deadlines", items, src, { academic_year: deadlineAcademicYear(start + 1), flags: ["cds-deadline"] }));
  }
  const tuition = num(r.tuition), fees = num(r.required_fees);
  // Tuition only (like the official fee pages); required fees go to mandatory_fees.
  if (tuition != null && tuition > 0)
    push(out, observe(b, "tuition", { amount: tuition, range_min: null, range_max: null, currency: "USD", period: "year", usd: Math.round(tuition), fx: null,
      basis: fees != null ? `CDS G1: tuition ${tuition}; required fees ${fees} (tuition + fees ${tuition + fees})` : "CDS G1: tuition" }, src, opt));
  push(out, observe(b, "mandatory_fees", usdMoney(fees), src, opt));
  push(out, observe(b, "room_board", usdMoney(r.room_board), src, opt));
  const aid = r.intl_aid;
  if (aid && typeof aid === "object") {
    const cnt = num(aid.count ?? aid.nonresident_aided), avg = num(aid.avg ?? aid.avg_award);
    const available = typeof aid.available === "boolean" ? aid.available : cnt != null ? cnt > 0 : null;
    if (cnt != null || avg != null || available != null)
      push(out, observe(b, "intl_aid", { available, count: cnt, avg_usd: avg, text: str(aid.note) ?? "CDS H6: aid to non-resident (international) first-years" }, src, opt));
  }
  return out;
}

export const cds: Adapter = {
  name: "cds",
  inputs: () => glob("data/review", /^cds-.*\.json$/),
  read(ctx) {
    const out: Observation[] = [];
    for (const file of this.inputs()) {
      const d = readJson<Any>(file);
      for (const r of recs(d)) {
        const id = str(r.university_id) ?? str(r.id);
        if (ctx.scope && id && !ctx.scope.has(id)) continue;
        out.push(...cdsObservations(r, file, str(d.generated)));
      }
    }
    return out;
  },
};

// ── CRICOS (AU) + DUO (NL) course lists ──
export interface Course { source: string; university_id: string; name: string; field: string | null; level: string | null; years: number | null; total_cost: number | null; currency: string | null; source_url: string | null; retrieved_at: string | null; academic_year: string | null; language: string | null }

/** Course-level metric rows → courses. Rows of one course are consecutive; a repeated metric starts the next course (same name, other campus). */
export function coursesOf(rows: Any[]): Course[] {
  const out: Course[] = [];
  const open = new Map<string, { c: Course; seen: Set<string> }>();
  for (const r of rows) {
    const id = str(r.matched_university_id) ?? str(r.university_id);
    const name = str(r.course_name);
    const metric = str(r.metric);
    if (!id || !name || !metric) continue;
    const key = `${r.source}|${id}|${r.institution_name}|${name}`;
    let g = open.get(key);
    if (!g || g.seen.has(metric)) {
      g = { c: { source: String(r.source ?? ""), university_id: id, name, field: str(r.field), level: str(r.niveau) ?? null, years: null, total_cost: null, currency: null,
        source_url: firstUrl(r.source_url), retrieved_at: isoDayOf(r.retrieved_at), academic_year: academicYear(r.academic_year), language: null }, seen: new Set() };
      open.set(key, g);
      out.push(g.c);
    }
    g.seen.add(metric);
    if (metric === "duration_years" && num(r.value) != null) g.c.years = num(r.value);
    else if (metric === "course_total_cost" && num(r.value) != null) { g.c.total_cost = num(r.value); g.c.currency = str(r.currency); }
    else if (metric === "course_level") g.c.level = str(r.value) ?? g.c.level;
    else if (metric === "language") g.c.language = str(r.value);
  }
  return out;
}

const collectorOfSource = (s: string) => (/cricos/i.test(s) ? "cricos" : /duo|rio/i.test(s) ? "duo" : s.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "dataset");
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Per university: bachelor programme list, and (CRICOS) tuition per year = total course cost ÷ duration, min–median–max. */
export function courseObservations(courses: Course[], file: string): Observation[] {
  const out: Observation[] = [];
  const byUni = new Map<string, Course[]>();
  for (const c of courses) { const k = `${c.university_id}|${collectorOfSource(c.source)}`; byUni.set(k, [...(byUni.get(k) ?? []), c]); }
  for (const [k, list] of [...byUni].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const [id, collector] = k.split("|");
    const head = list.find((c) => c.source_url) ?? list[0];
    const b: Base = { university_id: id, collector, input: file, verified: true, defaultMethod: "dataset" };
    const src = { source_url: head.source_url, retrieved_at: head.retrieved_at, method: "dataset" };
    const progs = list.map((c) => ({ name: c.name.slice(0, 300), faculty: c.field, degree: c.level, years: c.years != null ? round2(c.years) : null, requires: null, source_url: c.source_url }));
    push(out, observe(b, "programmes", progs, src, { academic_year: head.academic_year }));
    const annual = list.filter((c) => c.total_cost != null && c.years && c.years >= 0.5).map((c) => c.total_cost! / c.years!);
    const cur = list.find((c) => c.currency)?.currency ?? null;
    if (annual.length && cur) {
      const lo = Math.round(Math.min(...annual)), mid = Math.round(median(annual)), hi = Math.round(Math.max(...annual));
      const { usd, fx } = toUsd(mid, cur);
      push(out, observe(b, "tuition", { amount: mid, range_min: lo, range_max: hi, currency: cur, period: "year", usd, fx,
        basis: `Estimate: CRICOS total course cost ÷ duration over ${annual.length} bachelor courses — min ${lo}, median ${mid}, max ${hi} ${cur}/year` },
      { ...src, note: "Derived from the CRICOS 'Estimated Total Course Cost'; check the official fee page for your course." }, { academic_year: head.academic_year, derived: true, flags: ["derived", "range-min-median-max", ...(usd == null ? ["fx-missing"] : [])] }));
    }
  }
  return out;
}

export const courseDatasets: Adapter = {
  name: "cricos-duo",
  inputs: () => ["data/review/datasets-nov16.json"].filter(exists),
  read(ctx) {
    const out: Observation[] = [];
    for (const file of this.inputs()) {
      const rows = recs(readJson(file)).filter((r) => !ctx.scope || ctx.scope.has(r.matched_university_id));
      out.push(...courseObservations(coursesOf(rows), file));
    }
    return out;
  },
};

// ── Round-2 national datasets (datasets-nov16b.json) ──
export const ORIGINS: Record<string, string> = { kazakhstan: "KZ", uzbekistan: "UZ", kyrgyzstan: "KG", "kyrgyz republic": "KG", tajikistan: "TJ", kz: "KZ", uz: "UZ", kg: "KG", tj: "TJ" };
export const originOf = (r: Any) => ORIGINS[String(r.origin ?? r.domicile ?? r.origin_country ?? r.nationality ?? r.citizenship ?? "").toLowerCase().trim()] ?? null;
export const COUNTRY_METRICS = ["study_visas_granted", "f1_visas_issued", "applicants_by_domicile", "accepted_by_domicile", "student_visas_issued", "enrolled_by_domicile"];

export function nov16bObservations(rows: Any[], file: string): Observation[] {
  const out: Observation[] = [];
  const tuition = new Map<string, Any[]>();
  const progs = new Map<string, Any[]>();
  for (const r of rows) {
    const id = str(r.matched_university_id) ?? str(r.university_id);
    const metric = str(r.metric);
    if (!id || !metric || COUNTRY_METRICS.includes(metric)) continue;
    const collector = `nov16b-${String(r.source ?? "dataset").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
    const b: Base = { university_id: id, name: r.institution_name, country_code: r.country_code, collector, input: file, verified: true, defaultMethod: "dataset" };
    const ay = academicYear(r.academic_year ?? r.year);
    const src = { source_url: firstUrl(r.source_url), retrieved_at: r.retrieved_at, method: "dataset", note: str(r.licence) };
    const year = ay ? Number(ay.slice(0, 4)) : num(r.year);
    const v = num(r.value);
    if (metric === "tuition_undergrad_year" && v != null && v > 0) tuition.set(`${id}|${collector}`, [...(tuition.get(`${id}|${collector}`) ?? []), { ...r, b, src, ay }]);
    else if (metric === "intl_students" && v != null) push(out, observe(b, "intl_students", { value: v, year }, src, { academic_year: ay }));
    else if (/^(applicants|admitted|accepted)(_by_provider)?$/.test(metric) && v != null && !originOf(r))
      push(out, observe(b, metric.startsWith("applicants") ? "applicants" : "admitted", { value: v, year }, src, { academic_year: ay, flags: [`unit:${str(r.unit) ?? metric}`.slice(0, 120)] }));
    else if (metric === "programme" || metric === "programmes") progs.set(`${id}|${collector}`, [...(progs.get(`${id}|${collector}`) ?? []), { ...r, b, src, ay }]);
    else if (metric === "scholarship_deadline" && str(r.value)) {
      const items = deadlinesOf([{ round: "Scholarship", label: str(r.course_name) ?? "Scholarship deadline", date: r.value, cycle: `${INTAKE} entry` }], { source_url: src.source_url ?? "", retrieved_at: isoDayOf(r.retrieved_at) ?? "", method: "dataset", collector });
      push(out, observe(b, "deadlines", items, src, { academic_year: deadlineAcademicYear(INTAKE) }));
    }
  }
  for (const list of tuition.values()) {
    const { b, src, ay } = list[0];
    const cur = str(list[0].currency) ?? "USD";
    const vals = list.filter((x) => (str(x.currency) ?? "USD") === cur).map((x) => num(x.value)!);
    const lo = Math.min(...vals), hi = Math.max(...vals), mid = Math.round(median(vals));
    const { usd, fx } = toUsd(vals.length > 1 ? mid : vals[0], cur);
    push(out, observe(b, "tuition", { amount: vals.length > 1 ? mid : vals[0], range_min: vals.length > 1 ? lo : null, range_max: vals.length > 1 ? hi : null, currency: cur, period: "year", usd, fx,
      basis: vals.length > 1 ? `${vals.length} undergraduate tuition values: min ${lo}, median ${mid}, max ${hi} ${cur}/year` : "official dataset: undergraduate tuition per year" }, src, { academic_year: ay, flags: usd == null ? ["fx-missing"] : [] }));
  }
  for (const list of progs.values()) {
    const { b, src, ay } = list[0];
    push(out, observe(b, "programmes", list.map((x) => ({ name: (str(x.value) ?? str(x.course_name) ?? "").slice(0, 300), faculty: str(x.field), degree: str(x.degree) ?? str(x.niveau), years: num(x.duration_years), requires: null, source_url: firstUrl(x.source_url) })).filter((p) => p.name), src, { academic_year: ay }));
  }
  return out;
}

export const nov16b: Adapter = {
  name: "datasets-nov16b",
  inputs: () => ["data/review/datasets-nov16b.json"].filter(exists),
  read() {
    const out: Observation[] = [];
    for (const file of this.inputs()) out.push(...nov16bObservations(recs(readJson(file)), file));
    return out;
  },
};

// ── country-level origin stats → data/curated/country-stats.json ──
export interface CountryStat { metric: string; value: number; year: string | null; period: string | null; university_id: string | null; institution: string | null; source_url: string; retrieved_at: string | null; unit: string | null }
/** {destination: {origin (KZ/UZ/KG/TJ): [stats]}} — only the four target origins, only rows with a source URL. */
export function countryStatsOf(rows: Any[]): Record<string, Record<string, CountryStat[]>> {
  const out: Record<string, Record<string, CountryStat[]>> = {};
  for (const r of rows) {
    const metric = str(r.metric), origin = originOf(r), url = firstUrl(r.source_url), v = num(r.value);
    if (!metric || !origin || !url || v == null || (!COUNTRY_METRICS.includes(metric) && !/by_domicile|visa/.test(metric))) continue;
    const dest = (str(r.destination_country) ?? str(r.country_code) ?? "??").toUpperCase();
    ((out[dest] ??= {})[origin] ??= []).push({ metric, value: v, year: academicYear(r.academic_year ?? r.year) ?? str(r.year), period: str(r.academic_year) ?? str(r.year), university_id: str(r.matched_university_id) ?? str(r.university_id),
      institution: str(r.institution_name), source_url: url, retrieved_at: isoDayOf(r.retrieved_at), unit: str(r.unit) });
  }
  for (const d of Object.values(out)) for (const list of Object.values(d)) list.sort((a, b) => (a.metric + (a.year ?? "") + (a.institution ?? "") < b.metric + (b.year ?? "") + (b.institution ?? "") ? -1 : 1));
  return out;
}
export function buildCountryStats() {
  const file = "data/review/datasets-nov16b.json";
  const rows = exists(file) ? recs(readJson(file)) : [];
  return {
    note: "Country-level origin statistics for Central Asian applicants (KZ, UZ, KG, TJ), from official datasets. Built by data:merge from data/review/datasets-nov16b.json.",
    input: exists(file) ? file : null, rows_read: rows.length,
    fields: "metric, value, year (normalised academic year), period (the source's own wording), university_id/institution when per-provider, source_url, retrieved_at, unit",
    destinations: countryStatsOf(rows),
  };
}
