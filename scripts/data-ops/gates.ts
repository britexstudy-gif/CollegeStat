// Quality gates shared by merge (filters observations) and check (re-validates curated output).
import { validateFieldValue, yearStart, type FieldName, type Observation } from "./model";
import { inCycle, loadFx, yearStatus, type FxTable } from "./normalise";

export const LIMITS = {
  tuition_usd: [0, 120_000],
  ielts: [4, 9],
  toefl_ibt: [0, 120],
  toefl_band_2026: [1, 6],
  duolingo: [10, 160],
  acceptance: [0, 100],
  application_fee_usd: [0, 2_000],
} as const;
export const STALE_MONTHS = 12;

const out = (v: number | null | undefined, [lo, hi]: readonly [number, number]) => v != null && (v < lo || v > hi);

/** Hard failures: the value must not enter the curated set. */
export function rejectReasons(o: Pick<Observation, "field" | "value" | "source_url" | "retrieved_at">): string[] {
  const reasons: string[] = [];
  if (!o.source_url) reasons.push("missing-source: no source_url");
  if (!o.retrieved_at) reasons.push("missing-source: no retrieved_at");
  const schema = validateFieldValue(o.field, o.value);
  if (schema) reasons.push(`schema: ${schema}`);
  reasons.push(...rangeErrors(o.field, o.value));
  return reasons;
}

export function rangeErrors(field: FieldName, value: unknown): string[] {
  const v = value as Record<string, number | null>;
  const r: string[] = [];
  if (field === "tuition" && out(v.usd, LIMITS.tuition_usd)) r.push(`range: tuition ${v.usd} USD outside 0–120k`);
  if (field === "ielts" && (out(v.overall, LIMITS.ielts) || out(v.component, LIMITS.ielts))) r.push(`range: IELTS ${v.overall}/${v.component} outside 4–9`);
  if (field === "toefl" && out(v.ibt, LIMITS.toefl_ibt)) r.push(`range: TOEFL iBT ${v.ibt} outside 0–120`);
  if (field === "toefl" && out(v.band_2026, LIMITS.toefl_band_2026)) r.push(`range: TOEFL 2026 band ${v.band_2026} outside 1–6`);
  if (field === "duolingo" && out(v.minimum, LIMITS.duolingo)) r.push(`range: Duolingo ${v.minimum} outside 10–160`);
  if (field === "acceptance_rate" && (out(v.percent, LIMITS.acceptance) || v.percent === 0)) r.push(`range: acceptance ${v.percent}% impossible (must be >0 and ≤100)`);
  if (field === "sat_scores" && ["reading_25", "reading_75", "math_25", "math_75"].some((k) => out(v[k], [200, 800]))) r.push("range: SAT section outside 200–800");
  if (field === "sat_scores" && out(v.average, [400, 1600])) r.push(`range: SAT average ${v.average} outside 400–1600`);
  if (field === "act_scores" && (out(v.p25, [1, 36]) || out(v.p75, [1, 36]))) r.push("range: ACT outside 1–36");
  if (field === "cost_of_attendance" && out(v.usd, [0, 150_000])) r.push(`range: cost of attendance ${v.usd} USD outside 0–150k`);
  if (field === "application_fee" && out(v.usd, LIMITS.application_fee_usd)) r.push(`range: application fee ${v.usd} USD outside 0–2000`);
  if (field === "sat_scores" && out(v.composite_25, [400, 1600])) r.push(`range: SAT composite ${v.composite_25} outside 400–1600`);
  if (field === "sat_scores" && out(v.composite_75, [400, 1600])) r.push(`range: SAT composite ${v.composite_75} outside 400–1600`);
  for (const [lo, hi] of [["reading_25", "reading_75"], ["math_25", "math_75"], ["composite_25", "composite_75"], ["p25", "p75"]] as const)
    if ((field === "sat_scores" || field === "act_scores") && v[lo] != null && v[hi] != null && v[lo]! > v[hi]!) r.push(`impossible: ${field} ${lo} ${v[lo]} > ${hi} ${v[hi]}`);
  if (field === "tuition" && v.range_min != null && v.range_max != null && v.range_min > v.range_max) r.push(`impossible: tuition range ${v.range_min} > ${v.range_max}`);
  if (field === "room_board" && out(v.usd, [0, 60_000])) r.push(`range: room & board ${v.usd} USD outside 0–60k`);
  if (field === "intl_aid" && (out(v.avg_usd, [0, 120_000]) || (v.count != null && v.count > 50_000))) r.push(`range: international aid ${v.count}/${v.avg_usd} implausible`);
  if ((field === "applicants" || field === "admitted" || field === "intl_students") && out(v.value, [0, 2_000_000])) r.push(`range: ${field} ${v.value} implausible`);
  r.push(...fxErrors(field, value));
  if (field === "deadlines" && Array.isArray(value))
    for (const d of value as { date: string | null; intake_year: number }[]) if (d.date && !inCycle(d.date, d.intake_year)) r.push(`range: deadline ${d.date} outside the ${d.intake_year} cycle`);
  return r;
}

/** Months between two ISO days (b − a). */
export const monthsBetween = (a: string, b: string) => {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma) + (db - da) / 31;
};

/** Soft flags: value stays but is marked (stale → history only when the year is too old). */
export function staleness(p: { retrieved_at: string | null; academic_year: string | null }, asOf: string): { stale: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (yearStatus(p.academic_year) === "stale") reasons.push(`stale: academic year ${p.academic_year} is older than 2025/26`);
  if (p.retrieved_at && monthsBetween(p.retrieved_at, asOf) > STALE_MONTHS) reasons.push(`stale: retrieved ${p.retrieved_at}, over ${STALE_MONTHS} months ago`);
  return { stale: reasons.length > 0, reasons };
}
export const isOldYear = (ay: string | null) => yearStatus(ay) === "stale";
export { yearStart };

// ── currency sanity (USD value must match amount × dated rate) ──
const MONEY_FIELDS = new Set<FieldName>(["tuition", "mandatory_fees", "living_cost", "application_fee", "cost_of_attendance", "net_price", "median_earnings_10y", "room_board"]);
export function fxErrors(field: FieldName, value: unknown, fx: FxTable | null = null): string[] {
  if (!MONEY_FIELDS.has(field) || !value || typeof value !== "object") return [];
  const v = value as { amount: number | null; range_min?: number | null; currency: string | null; usd: number | null; period?: string; fx?: { usd_per_unit: number } | null };
  if (v.usd == null || !v.currency) return [];
  const base = v.amount ?? v.range_min ?? null;
  if (base == null || base === 0) return [];
  const rate = v.fx?.usd_per_unit ?? (fx ?? loadFx())[v.currency]?.usd_per_unit;
  if (v.currency === "USD") return Math.abs(v.usd - base) > 1 && Math.abs(v.usd - 2 * base) > 1 ? [`fx: USD amount ${base} but usd ${v.usd}`] : [];
  if (!rate) return [`fx: ${v.currency} not in fx-rates.json but usd=${v.usd} is set`];
  // Annualised semesters (×2) are legitimate; anything else is a currency mix-up.
  const exp = base * rate, ratio = v.usd / exp;
  return [1, 2].some((k) => Math.abs(v.usd! - k * exp) <= Math.max(1, 0.03 * k * exp)) ? [] : [`fx: ${base} ${v.currency} × ${rate.toFixed(4)} ≠ usd ${v.usd} (ratio ${ratio.toFixed(2)})`];
}

// ── cross-source validation (per university, after resolution) ──
export const CROSS = { sat_gap: 30, admit_gap: 5, tuition_jump: 0.25, cds_rate_gap: 1.5 } as const;
export interface CrossIssue { field: FieldName; kind: "sat-gap" | "admit-gap" | "cds-internal" | "tuition-jump" | "impossible"; severity: "error" | "warning"; detail: string; penalty: number; drop?: FieldName[] }
type Obs = Pick<Observation, "field" | "value" | "collector" | "academic_year">;
type FactLike = { value: any; collector: string; academic_year: string | null }; // eslint-disable-line @typescript-eslint/no-explicit-any

const newest = (list: Obs[]) => [...list].sort((a, b) => (yearStart(b.academic_year) ?? 0) - (yearStart(a.academic_year) ?? 0))[0];
export function crossChecks(facts: Record<string, FactLike>, cands: Obs[], history: { field: string; value: unknown; academic_year: string | null }[]): CrossIssue[] {
  const out: CrossIssue[] = [];
  const of = (field: FieldName, collector: string) => newest(cands.filter((c) => c.field === field && c.collector === collector));
  // SAT: Scorecard vs CDS
  const sc = of("sat_scores", "scorecard"), cd = of("sat_scores", "cds");
  if (sc && cd) {
    const a = sc.value as Record<string, number | null>, b = cd.value as Record<string, number | null>;
    const gaps = ["reading_25", "reading_75", "math_25", "math_75"].filter((k) => a[k] != null && b[k] != null).map((k) => [k, Math.abs(a[k]! - b[k]!)] as const);
    const comp = (x: Record<string, number | null>, p: "25" | "75") => (x[`reading_${p}`] != null && x[`math_${p}`] != null ? x[`reading_${p}`]! + x[`math_${p}`]! : x[`composite_${p}`] ?? null);
    for (const p of ["25", "75"] as const) { const x = comp(a, p), y = comp(b, p); if (x != null && y != null) (gaps as (readonly [string, number])[]).push([`composite_${p}`, Math.abs(x - y)]); }
    const worst = [...gaps].sort((x, y) => y[1] - x[1])[0];
    if (worst && worst[1] > CROSS.sat_gap)
      out.push({ field: "sat_scores", kind: "sat-gap", severity: "warning", penalty: 0.15, detail: `SAT ${worst[0]} differs by ${worst[1]} pts: Scorecard ${sc.academic_year} vs CDS ${cd.academic_year}` });
  }
  // Admit rate: Scorecard vs CDS
  const sa = of("acceptance_rate", "scorecard"), ca = of("acceptance_rate", "cds");
  if (sa && ca) {
    const d = Math.abs((sa.value as { percent: number }).percent - (ca.value as { percent: number }).percent);
    if (d > CROSS.admit_gap) out.push({ field: "acceptance_rate", kind: "admit-gap", severity: "warning", penalty: 0.15,
      detail: `acceptance rate differs by ${d.toFixed(1)} pts: Scorecard ${sa.academic_year} ${(sa.value as { percent: number }).percent}% vs CDS ${ca.academic_year} ${(ca.value as { percent: number }).percent}%` });
  }
  // Internal: admitted ≤ applicants; CDS admit rate ≈ admitted / applicants
  const ap = facts.applicants?.value?.value, ad = facts.admitted?.value?.value;
  if (ap != null && ad != null && facts.applicants.academic_year === facts.admitted.academic_year) {
    if (ad > ap) out.push({ field: "admitted", kind: "impossible", severity: "error", penalty: 0, drop: ["applicants", "admitted"], detail: `admitted ${ad} > applicants ${ap}` });
    else if (ap > 0 && facts.acceptance_rate?.collector === "cds" && facts.acceptance_rate.academic_year === facts.applicants.academic_year) {
      const calc = (ad / ap) * 100, stated = facts.acceptance_rate.value.percent;
      if (Math.abs(calc - stated) > CROSS.cds_rate_gap) out.push({ field: "acceptance_rate", kind: "cds-internal", severity: "warning", penalty: 0.1, detail: `stated ${stated}% but admitted/applicants = ${calc.toFixed(1)}%` });
    }
  }
  // Tuition jump vs the newest older-year value (history)
  const tu = facts.tuition?.value;
  if (tu?.usd != null && tu.period === "year") {
    const prev = history.filter((h) => h.field === "tuition" && (yearStart(h.academic_year) ?? 9999) < (yearStart(facts.tuition.academic_year) ?? 0))
      .sort((a, b) => (yearStart(b.academic_year) ?? 0) - (yearStart(a.academic_year) ?? 0))[0];
    const pu = (prev?.value as { usd: number | null; period: string } | undefined);
    if (pu?.usd && pu.period === "year") {
      const ch = (tu.usd - pu.usd) / pu.usd;
      if (Math.abs(ch) > CROSS.tuition_jump) out.push({ field: "tuition", kind: "tuition-jump", severity: "warning", penalty: 0.1,
        detail: `tuition ${ch > 0 ? "+" : ""}${Math.round(ch * 100)}% vs ${prev.academic_year} (${pu.usd} → ${tu.usd} USD)` });
    }
  }
  return out;
}
