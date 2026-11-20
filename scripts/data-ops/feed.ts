// Curated set → the input shapes scripts/ingest/build-v2.ts already understands
// (the targets-latest record shape + the programmes-latest shape), so data/v2 is built from curated data.
import { existsSync } from "node:fs";
import { path } from "../ingest/lib";
import type { CuratedRecord, FieldValue } from "./model";
import { readNdjson } from "./check";

type Fact<T = any> = { value: T; source_url: string; retrieved_at: string; method: string; collector: string; academic_year: string | null; flags: string[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const src = (f: Fact) => ({ source_url: f.source_url, retrieved_at: f.retrieved_at, method: f.method === "snippet" ? "search snippet - verify" : f.method, origin: `curated:${f.collector}` });

export function toLatestShape(r: CuratedRecord): Any {
  const f = r.facts as Record<string, Fact>;
  const out: Any = { id: r.id, slug: r.slug, name: r.name, country_code: r.country_code };
  if (f.tuition) {
    const t = f.tuition.value as FieldValue<"tuition">;
    const fees = f.mandatory_fees?.value as FieldValue<"mandatory_fees"> | undefined;
    out.tuition = {
      ...src(f.tuition), amount: t.amount, range_min: t.range_min, range_max: t.range_max,
      currency: t.period === "year" ? t.currency : `${t.currency} per ${t.period}`, academic_year: f.tuition.academic_year,
      usd: t.period === "year" ? t.usd : null, fx_rate_usd_per_unit: t.fx?.usd_per_unit ?? null, fx_date: t.fx?.date ?? null,
      mandatory_fees: fees && fees.currency === t.currency ? fees.amount : null, basis: t.basis,
    };
  }
  if (f.deadlines) {
    const items = f.deadlines.value as FieldValue<"deadlines">;
    out.deadlines = { ...src(f.deadlines), value: items.map((d) => ({ round: d.label, date: d.date ?? d.text, cycle: `${d.intake_year} entry` })) };
    if (items.some((d) => d.date_inferred)) out.deadlines.method = "year inferred from cycle";
  }
  if (f.platform) out.platform = { ...src(f.platform), value: (f.platform.value as FieldValue<"platform">).label };
  const en = f.ielts ?? f.toefl ?? f.duolingo;
  if (en) {
    const ielts = f.ielts?.value as FieldValue<"ielts"> | undefined;
    const toefl = f.toefl?.value as FieldValue<"toefl"> | undefined;
    const det = f.duolingo?.value as FieldValue<"duolingo"> | undefined;
    const statusText = (s: string, text: string | null) => text ?? (s === "optional" ? "Optional" : s === "not_required" ? "Not required" : null);
    out.english = {
      ...src(en),
      ielts: ielts ? (ielts.overall != null ? { overall_minimum: ielts.overall, band_minimum: ielts.component } : statusText(ielts.status, ielts.text)) : null,
      toefl_ibt: toefl ? (toefl.ibt != null ? { minimum: toefl.ibt, section_minimum: toefl.ibt_component, scale_note: toefl.band_2026 != null ? `tests on/after 2026-01-21: minimum ${toefl.band_2026} on the 1-6 scale` : null } : statusText(toefl.status, toefl.text)) : null,
      duolingo: det ? (det.minimum != null ? { minimum: det.minimum } : statusText(det.status, det.text)) : null,
      sources: Object.fromEntries((["ielts", "toefl", "duolingo"] as const).filter((k) => f[k]).map((k) => [k === "toefl" ? "toefl_ibt" : k, src(f[k])])),
    };
  }
  if (f.sat_act) out.sat_act = { ...src(f.sat_act), value: (f.sat_act.value as FieldValue<"sat_act">).text ?? (f.sat_act.value as FieldValue<"sat_act">).policy };
  if (f.application_fee && (f.application_fee.value as FieldValue<"application_fee">).amount != null)
    out.application_fee = { ...src(f.application_fee), value: { amount: f.application_fee.value.amount, currency: f.application_fee.value.currency } };
  if (f.acceptance_rate) out.acceptance_rate = { ...src(f.acceptance_rate), value: f.acceptance_rate.value.percent, year: f.acceptance_rate.value.year };
  return out;
}

export function toProgrammesShape(r: CuratedRecord): Any | null {
  const p = (r.facts as Record<string, Fact>).programmes;
  if (!p) return null;
  return {
    university_id: r.id, name: r.name,
    programmes: (p.value as FieldValue<"programmes">).map((x) => ({
      name: x.name, field: x.faculty, degree: x.degree, duration_years: x.years, source_url: x.source_url ?? p.source_url, retrieved_at: p.retrieved_at,
      requirements: x.requires ? [{ kind: null, label: x.requires.slice(0, 200) }] : [],
    })),
  };
}

const ADMISSION_FIELDS = ["tuition", "deadlines", "platform", "ielts", "toefl", "duolingo", "sat_act", "application_fee", "acceptance_rate"];

/** Null when data/curated has not been built yet (build-v2 then falls back to the review files). */
export function loadCuratedFeed() {
  if (!existsSync(path("data/curated/universities.ndjson"))) return null;
  const records = readNdjson<CuratedRecord>("data/curated/universities.ndjson");
  const excluded = readNdjson<{ id: string; reason: string }>("data/curated/excluded.ndjson");
  return {
    latest: records.filter((r) => ADMISSION_FIELDS.some((f) => r.facts[f])).map(toLatestShape),
    programmes: records.map(toProgrammesShape).filter((x): x is Any => !!x),
    excluded: new Map(excluded.map((e) => [e.id, e.reason])),
  };
}
