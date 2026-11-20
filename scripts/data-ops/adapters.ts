// Source adapters: one per input shape. Each turns a file into Observations
// (one candidate value for one field of one university, with provenance). No IO besides reading.
import { existsSync, readdirSync, statSync } from "node:fs";
import { num, path, readJson, str } from "../ingest/lib";
import { INTAKE, type FieldName, type FieldValue, type Method, type Observation } from "./model";
import {
  academicYear, acceptanceOf, deadlineAcademicYear, deadlinesOf, documentsOf, duolingoOf, ieltsOf, isHttp, isoDayOf, methodOf,
  moneyOf, platformValueOf, programmesOf, satActOf, splitEnglishText, toeflOf, tuitionOf,
} from "./normalise";

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface Adapter {
  name: string;
  /** Repo-relative input files this adapter reads (only existing ones). */
  inputs(): string[];
  read(ctx: AdapterContext): Observation[];
}
export interface AdapterContext {
  /** Universities in scope for bulk datasets (targets ∪ researched). Null = all. */
  scope: Set<string> | null;
}

interface Src { source_url?: unknown; retrieved_at?: unknown; method?: unknown; note?: unknown }
export interface Base { university_id: string | null; slug?: unknown; name?: unknown; country_code?: unknown; collector: string; input: string; verified: boolean; defaultMethod: Method }

/** Builds one observation; returns null for empty values. */
export function observe<F extends FieldName>(b: Base, field: F, value: FieldValue<F> | null | undefined, src: Src, extra: { academic_year?: string | null; flags?: string[]; method?: Method; derived?: boolean } = {}): Observation<F> | null {
  if (value == null || (Array.isArray(value) && value.length === 0)) return null;
  return {
    university_id: b.university_id, slug: str(b.slug), name: str(b.name), country_code: str(b.country_code),
    field, value, source_url: isHttp(src.source_url) ? String(src.source_url).trim() : null, retrieved_at: isoDayOf(src.retrieved_at),
    method: extra.method ?? methodOf(src.method, b.defaultMethod), collector: b.collector, verified: b.verified,
    academic_year: extra.academic_year ?? null, flags: extra.flags ?? [], note: str(src.note)?.slice(0, 500) ?? null, input: b.input,
    ...(extra.derived ? { derived: true } : {}),
  };
}
const push = (out: Observation[], o: Observation | null) => { if (o) out.push(o as Observation); };
const exists = (rel: string) => existsSync(path(rel));
const glob = (dir: string, re: RegExp) => (exists(dir) ? readdirSync(path(dir)).filter((f) => re.test(f)).sort().map((f) => `${dir}/${f}`) : []);
const recs = (d: unknown): Any[] => (Array.isArray(d) ? d : Array.isArray((d as Any)?.records) ? (d as Any).records : []);

/** Deadlines observation with per-item provenance. */
function deadlineObs(b: Base, value: unknown, src: Src): Observation | null {
  const prov = { source_url: isHttp(src.source_url) ? String(src.source_url) : "", retrieved_at: isoDayOf(src.retrieved_at) ?? "", method: methodOf(src.method, b.defaultMethod), collector: b.collector };
  const items = deadlinesOf(value, prov);
  const intake = items.reduce((m, d) => Math.max(m, d.intake_year), 0) || INTAKE;
  return observe(b, "deadlines", items, src, { academic_year: deadlineAcademicYear(intake) });
}

/** English block {ielts, toefl_ibt, duolingo, note} (the nov15 / PROMPT.md shape). */
function englishObs(out: Observation[], b: Base, en: Any | null | undefined, srcFallback?: Src) {
  if (!en || typeof en !== "object") return;
  const inner = en.value && typeof en.value === "object" && !Array.isArray(en.value) ? en.value : null;
  const block = inner ?? en;
  const src: Src = { source_url: block.source_url ?? en.source_url ?? srcFallback?.source_url, retrieved_at: block.retrieved_at ?? en.retrieved_at ?? srcFallback?.retrieved_at, method: en.method ?? block.method, note: en.note };
  push(out, observe(b, "ielts", ieltsOf(block.ielts), src));
  push(out, observe(b, "toefl", toeflOf(block.toefl_ibt ?? block.toefl), src));
  push(out, observe(b, "duolingo", duolingoOf(block.duolingo), src));
}

function tuitionObs(out: Observation[], b: Base, tu: Any | null | undefined) {
  if (!tu || typeof tu !== "object") return;
  const t = tuitionOf(tu);
  if (t) push(out, observe(b, "tuition", t.value, tu, { academic_year: t.academic_year, flags: t.flags }));
  const ay = t?.academic_year ?? academicYear(tu.academic_year);
  const cur = t?.value.currency ?? null;
  const fees = moneyOf(tu.mandatory_fees, cur);
  const feeSrc = tu.mandatory_fees && typeof tu.mandatory_fees === "object" && isHttp(tu.mandatory_fees.source_url) ? tu.mandatory_fees : tu;
  if (fees && (fees.amount != null || fees.text)) push(out, observe(b, "mandatory_fees", fees, feeSrc, { academic_year: ay }));
  const living = moneyOf(tu.living_cost && typeof tu.living_cost === "object" ? tu.living_cost.value ?? tu.living_cost : tu.living_cost, cur);
  if (living) push(out, observe(b, "living_cost", living, tu, { academic_year: ay }));
}

// ── 1. oc-shards (data/review/oc-shards/PROMPT.md shape) ──
export const ocShards: Adapter = {
  name: "oc-shards",
  inputs: () => [...glob("data/review/oc-shards", /^output-\d+\.json$/), ...glob("data/review/ds-collect", /^output-\d+\.json$/)],
  read() {
    const out: Observation[] = [];
    for (const file of this.inputs()) {
      const n = /output-(\d+)/.exec(file)![1];
      for (const r of recs(readJson(file))) {
        const b: Base = { university_id: str(r.id), slug: r.slug, name: r.name, country_code: r.country_code, collector: `oc-shard-${n}`, input: file, verified: false, defaultMethod: "fetched" };
        tuitionObs(out, b, r.tuition);
        if (r.deadlines?.value) push(out, deadlineObs(b, r.deadlines.value, r.deadlines));
        if (r.platform?.value) push(out, observe(b, "platform", platformValueOf(r.platform.value), r.platform));
        englishObs(out, b, r.english);
        if (r.english_minimums?.value) {
          const parts = splitEnglishText(String(r.english_minimums.value));
          englishObs(out, b, { ielts: parts.ielts, toefl_ibt: parts.toefl, duolingo: parts.duolingo, ...r.english_minimums, value: undefined });
        }
        if (r.sat_act?.value) push(out, observe(b, "sat_act", satActOf(r.sat_act.value), r.sat_act));
        if (r.acceptance_rate?.value != null) {
          const a = acceptanceOf(r.acceptance_rate.value, num(r.acceptance_rate.year));
          push(out, observe(b, "acceptance_rate", a, r.acceptance_rate, { academic_year: a?.year ? academicYear(a.year) : null }));
        }
        if (r.documents?.value) push(out, observe(b, "documents", documentsOf(r.documents.value), r.documents));
        if (r.programmes?.value) push(out, observe(b, "programmes", programmesOf(r.programmes.value, isHttp(r.programmes.source_url) ? r.programmes.source_url : null), r.programmes));
      }
    }
    return out;
  },
};

// ── 2. targets-latest (nov15 research, carries verified nov14 values) ──
const collectorOfOrigin = (origin: unknown, fallback: string) => {
  const o = str(origin) ?? "";
  if (/nov14-merged/.test(o)) return "nov14-merged";
  if (/programmes-costs-nov14/.test(o)) return "programmes-costs-nov14";
  return o ? o.replace(/\s*\(.*\)$/, "") : fallback;
};
export const targetsLatest: Adapter = {
  name: "targets-latest",
  inputs: () => glob("data/review", /^targets-latest-.*\.json$/),
  read() {
    const out: Observation[] = [];
    for (const file of this.inputs()) {
      const fallback = /targets-latest-(.*)\.json/.exec(file)![1] + "-research";
      for (const r of recs(readJson(file))) {
        const base = (block: Any | null | undefined): Base => ({
          university_id: str(r.id), slug: r.slug, name: r.name, country_code: r.country_code, input: file,
          collector: collectorOfOrigin(block?.origin, fallback), verified: /verified\)/.test(str(block?.origin) ?? ""), defaultMethod: "fetched",
        });
        tuitionObs(out, base(r.tuition), r.tuition);
        if (r.deadlines?.value) push(out, deadlineObs(base(r.deadlines), r.deadlines.value, r.deadlines));
        if (r.platform?.value) push(out, observe(base(r.platform), "platform", platformValueOf(r.platform.value), r.platform));
        englishObs(out, base(r.english), r.english);
        if (r.sat_act?.value) push(out, observe(base(r.sat_act), "sat_act", satActOf(r.sat_act.value), r.sat_act));
        if (r.required_documents?.value) push(out, observe(base(r.required_documents), "documents", documentsOf(r.required_documents.value), r.required_documents));
      }
    }
    return out;
  },
};

// ── 3. nov14 merged admissions ({university_id, fields: {name: {value, source_url, checked_at, status}}, parsed}) ──
export const nov14Merged: Adapter = {
  name: "nov14-merged",
  inputs: () => ["data/review/segment-admissions-nov14-merged.json"].filter(exists),
  read() {
    const out: Observation[] = [];
    for (const file of this.inputs()) for (const r of readJson<Any[]>(file)) {
      const f = r.fields ?? {};
      const b = (name: string): Base => ({ university_id: str(r.university_id), name: r.name, collector: "nov14-merged", input: file, verified: f[name]?.status === "verified", defaultMethod: "fetched" });
      const get = (name: string) => (f[name] && f[name].status !== "empty" && f[name].value != null ? f[name] : null);
      const src = (x: Any): Src => ({ source_url: x.source_url, retrieved_at: x.checked_at, method: x.status === "unverified" ? "unverified" : undefined });
      const tu = get("tuition");
      if (tu) {
        const raw = typeof tu.value === "object" ? { ...tu.value, source_url: tu.source_url, retrieved_at: tu.checked_at } : { value: tu.value, source_url: tu.source_url, retrieved_at: tu.checked_at };
        const t = tuitionOf(raw);
        if (t) push(out, observe(b("tuition"), "tuition", t.value, src(tu), { academic_year: t.academic_year, flags: t.flags }));
      }
      const dl = get("deadlines");
      if (dl) push(out, deadlineObs(b("deadlines"), r.parsed?.deadlines?.length ? r.parsed.deadlines : dl.value, src(dl)));
      const route = get("application_route");
      if (route) push(out, observe(b("application_route"), "platform", platformValueOf(route.value), src(route)));
      const fee = get("application_fee");
      if (fee) push(out, observe(b("application_fee"), "application_fee", moneyOf(r.parsed?.fee ?? fee.value), src(fee), { academic_year: deadlineAcademicYear(INTAKE) }));
      for (const [key, field, fn] of [["ielts", "ielts", ieltsOf], ["toefl", "toefl", toeflOf], ["duolingo", "duolingo", duolingoOf]] as const) {
        const v = get(key);
        if (v) push(out, observe(b(key), field, (fn as (x: unknown) => FieldValue<typeof field> | null)(v.value), src(v)));
      }
    }
    return out;
  },
};

// ── 4. programmes-latest ({universities: {slug: {id, programmes: [...]}}} or array) ──
export const programmesLatest: Adapter = {
  name: "programmes-latest",
  inputs: () => glob("data/review", /^programmes-latest-.*\.json$/),
  read() {
    const out: Observation[] = [];
    for (const file of this.inputs()) {
      const d = readJson<Any>(file);
      const list: Any[] = Array.isArray(d) ? d : Array.isArray(d.universities) ? d.universities : Object.values(d.universities ?? {});
      for (const u of list) {
        const progs = (u.programmes ?? []) as Any[];
        const first = progs.find((p) => isHttp(p.source_url)) ?? {};
        const b: Base = { university_id: str(u.id) ?? str(u.university_id), name: u.name, country_code: u.country_code, collector: collectorOfOrigin(u.origin, "programmes-latest"), input: file, verified: false, defaultMethod: "fetched" };
        push(out, observe(b, "programmes", programmesOf(progs, null), { source_url: first.source_url, retrieved_at: first.retrieved_at ?? first.checked_at }));
      }
    }
    return out;
  },
};

// ── 5. programmes-costs-nov14 ──
export const programmesCostsNov14: Adapter = {
  name: "programmes-costs-nov14",
  inputs: () => ["data/review/programmes-costs-nov14.json"].filter(exists),
  read() {
    const out: Observation[] = [];
    for (const file of this.inputs()) for (const r of readJson<Any[]>(file)) {
      const b: Base = { university_id: str(r.university_id), name: r.name, collector: "programmes-costs-nov14", input: file, verified: false, defaultMethod: "fetched" };
      const progs = (r.programmes ?? []) as Any[];
      push(out, observe(b, "programmes", programmesOf(progs, null), { source_url: progs[0]?.source_url ?? r.source_url, retrieved_at: progs[0]?.checked_at ?? r.checked_at }));
      if (r.tuition) {
        const t = tuitionOf(r.tuition);
        if (t) push(out, observe(b, "tuition", t.value, { source_url: r.tuition.source_url ?? r.tuition.url, retrieved_at: r.tuition.checked_at }, { academic_year: t.academic_year, flags: t.flags }));
      }
      const lc = r.living_cost;
      if (lc && (num(lc.amount) != null || str(lc.basis))) {
        push(out, observe(b, "living_cost", num(lc.amount) != null ? moneyOf({ amount: lc.amount, currency: lc.currency }) : { amount: null, currency: str(lc.currency), usd: null, text: str(lc.basis) },
          { source_url: lc.source_url ?? lc.url, retrieved_at: lc.checked_at }, { academic_year: academicYear(lc.academic_year) ?? academicYear(r.tuition?.academic_year) }));
      }
    }
    return out;
  },
};

// ── 6. published (reviewed) dates, fees, requirements ──
export const published: Adapter = {
  name: "published",
  inputs: () => [
    "data/published/application-dates-current.json", "data/published/application-dates-segment-nov14.json",
    "data/published/application-fees-current.json", "data/published/application-fees-segment-nov14.json",
    "data/published/requirements-current.json", "data/published/requirements-segment-nov14.json",
  ].filter(exists),
  read() {
    const out: Observation[] = [];
    for (const file of this.inputs()) {
      const rows = readJson<Any[]>(file);
      const collector = "published/" + file.split("/").pop()!.replace(/\.json$/, "");
      if (/application-dates/.test(file)) {
        const byUni = new Map<string, Any[]>();
        for (const d of rows) if (str(d.university_id)) byUni.set(d.university_id, [...(byUni.get(d.university_id) ?? []), d]);
        for (const [uid, list] of byUni) {
          for (const d of list) {
            const b: Base = { university_id: uid, collector, input: file, verified: d.verification_status === "verified", defaultMethod: "dataset" };
            const date = isoDayOf(d.due_date ?? d.due_at);
            if (!date) continue;
            push(out, deadlineObs(b, [{ round: d.title, date, cycle: d.cycle ?? (num(d.year) ? `${d.year} entry` : null) }], { source_url: d.source_url, retrieved_at: d.verified_at, method: "dataset" }));
          }
        }
      } else if (/application-fees/.test(file)) {
        for (const f of rows) {
          if (f.category !== "application_fee" || f.program_id) continue;
          const b: Base = { university_id: str(f.university_id), collector, input: file, verified: f.verification_status === "verified", defaultMethod: "dataset" };
          push(out, observe(b, "application_fee", moneyOf({ amount: f.amount, currency: f.currency }), { source_url: f.source_url, retrieved_at: f.verified_at, method: "dataset" },
            { academic_year: num(f.year) ? deadlineAcademicYear(num(f.year)!) : deadlineAcademicYear(INTAKE) }));
        }
      } else {
        for (const r of rows) {
          if (r.program_id) continue;
          const b: Base = { university_id: str(r.university_id), collector, input: file, verified: r.verification_status === "verified", defaultMethod: "dataset" };
          const kind = String(r.kind ?? "").toUpperCase();
          const src: Src = { source_url: r.source_url, retrieved_at: r.verified_at, method: "dataset", note: r.notes };
          const comp = /component|each|band/i.test(String(r.label ?? "")) && !/overall/i.test(String(r.label ?? ""));
          if (kind === "IELTS" && num(r.minimum) != null) push(out, observe(b, "ielts", comp ? null : { status: "required", overall: num(r.minimum), component: null, text: str(r.notes) }, src));
          else if (kind === "TOEFL" && num(r.minimum) != null && !comp) {
            const m = num(r.minimum)!;
            push(out, observe(b, "toefl", { status: "required", ibt: m > 6 ? m : null, ibt_component: null, band_2026: m <= 6 ? m : null, text: str(r.notes) }, src));
          } else if (kind === "DUOLINGO" && num(r.minimum) != null) push(out, observe(b, "duolingo", { status: "required", minimum: num(r.minimum), text: str(r.notes) }, src));
        }
      }
    }
    return out;
  },
};

// ── 7. IPEDS (verified government dataset, 2023/24 — older than the owner's cut-off, so it lands in history) ──
const fileDay = (rel: string) => new Date(statSync(path(rel)).mtimeMs).toISOString().slice(0, 10);
export const ipeds: Adapter = {
  name: "ipeds",
  inputs: () => ["data/published/ipeds-admissions-2023.json", "data/published/ipeds-fees-2023.json"].filter(exists),
  read(ctx) {
    const out: Observation[] = [];
    const inScope = (id: string) => !ctx.scope || ctx.scope.has(id);
    if (exists("data/published/ipeds-admissions-2023.json")) {
      const file = "data/published/ipeds-admissions-2023.json";
      const d = readJson<{ source: Any; fields: string[]; rows: unknown[][] }>(file);
      const idx = Object.fromEntries(d.fields.map((f, i) => [f, i]));
      for (const row of d.rows) {
        const id = String(row[idx.id]);
        if (!inScope(id)) continue;
        const b: Base = { university_id: id, slug: row[idx.slug], name: row[idx.name], country_code: "US", collector: "ipeds-2023", input: file, verified: true, defaultMethod: "dataset" };
        const src = { source_url: d.source.url, retrieved_at: d.source.retrieved_at, method: "dataset" };
        const rate = num(row[idx.acceptance_rate]);
        if (rate != null) push(out, observe(b, "acceptance_rate", { percent: rate, year: 2023 }, src, { academic_year: "2023/24" }));
        const policy = str(row[idx.test_policy]);
        if (policy) push(out, observe(b, "sat_act", { policy: policy === "test_optional" ? "optional" : policy === "required" ? "required" : policy === "not_considered" ? "not_considered" : "unknown", text: `IPEDS Fall 2023 admission test policy: ${policy}` }, src, { academic_year: "2023/24" }));
      }
    }
    if (exists("data/published/ipeds-fees-2023.json")) {
      const file = "data/published/ipeds-fees-2023.json";
      const d = readJson<{ fields: string[]; records: Record<string, (number | null)[]> }>(file);
      const src = { source_url: "https://nces.ed.gov/ipeds/datacenter/data/IC2023_AY.zip", retrieved_at: fileDay(file), method: "dataset" };
      for (const [id, vals] of Object.entries(d.records)) {
        if (!inScope(id)) continue;
        const b: Base = { university_id: id, country_code: "US", collector: "ipeds-2023", input: file, verified: true, defaultMethod: "dataset" };
        const [fee, tuition] = vals;
        if (tuition != null) push(out, observe(b, "tuition", { amount: tuition, range_min: null, range_max: null, currency: "USD", period: "year", usd: tuition, fx: null, basis: "IPEDS out-of-state tuition and fees" }, src, { academic_year: "2023/24" }));
        if (fee != null) push(out, observe(b, "application_fee", { amount: fee, currency: "USD", usd: fee, text: null }, src, { academic_year: "2023/24" }));
      }
    }
    return out;
  },
};

// ── 8. Wikidata facts (CC0 community dataset; not "verified") ──
export const wikidata: Adapter = {
  name: "wikidata",
  inputs: () => ["data/published/wikidata-facts-nov14.json"].filter(exists),
  read(ctx) {
    const out: Observation[] = [];
    for (const file of this.inputs()) {
      const d = readJson<{ generated_at: string; records: Record<string, Any> }>(file);
      for (const [id, r] of Object.entries(d.records)) {
        if (ctx.scope && !ctx.scope.has(id)) continue;
        const b: Base = { university_id: id, slug: r.slug, collector: "wikidata", input: file, verified: false, defaultMethod: "dataset" };
        if (num(r.founded?.year) != null) push(out, observe(b, "founded_year", num(r.founded.year)!, { source_url: r.founded.source_url, retrieved_at: d.generated_at, method: "dataset" }));
        if (num(r.students?.value) != null) push(out, observe(b, "student_count", { value: num(r.students.value)!, year: isoDayOf(r.students.date) ? Number(r.students.date.slice(0, 4)) : null }, { source_url: r.students.source_url, retrieved_at: d.generated_at, method: "dataset" }));
      }
    }
    return out;
  },
};
