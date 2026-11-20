// Normalisers for the merge engine: messy collector values → canonical field values.
// Builds on scripts/ingest/normalise.ts (dates, rounds, platforms, tuition text) and adds
// FX to USD with a dated table, the TOEFL 2026 1–6 band, method classification and year rules.
import { readFileSync } from "node:fs";
import {
  academicYearOf, currencyOf, deadlinesFromValue, platformOf, satActPolicyOf, statusOf, tuitionFromText, type TestStatus,
} from "../ingest/normalise";
import { num, path, str } from "../ingest/lib";
import { INTAKE, OLDEST_CURRENT_YEAR, yearStart, type FieldValue, type Method } from "./model";

// ── FX ──
export interface FxRate { usd_per_unit: number; date: string; source: string }
export type FxTable = Record<string, FxRate>;
let fxCache: FxTable | null = null;
export function loadFx(): FxTable {
  fxCache ??= (JSON.parse(readFileSync(path("data/curated/fx-rates.json"), "utf8")) as { rates: FxTable }).rates;
  return fxCache;
}
/** Converts an amount to USD with the dated table; null when the currency is not in it. */
export function toUsd(amount: number | null, currency: string | null, fx: FxTable = loadFx()): { usd: number | null; fx: FxRate | null } {
  if (amount == null || !currency) return { usd: null, fx: null };
  const rate = fx[currency];
  return rate ? { usd: Math.round(amount * rate.usd_per_unit), fx: rate } : { usd: null, fx: null };
}

// ── Method / provenance ──
/** Collector text → method. "search snippet - verify", "search-index extract … not fetched" → snippet. */
export function methodOf(text: unknown, fallback: Method = "fetched"): Method {
  const s = str(text)?.toLowerCase();
  if (!s) return fallback;
  if (/snippet|search[- ]index|not fetched|verify manually|aggregator|unverified/.test(s)) return "snippet";
  if (/dataset|ipeds|wikidata/.test(s)) return "dataset";
  return "fetched";
}
export const isoDayOf = (v: unknown): string | null => {
  const m = str(v) && /^(\d{4}-\d{2}-\d{2})/.exec(String(v).trim());
  return m ? m[1] : null;
};
export const isHttp = (v: unknown): v is string => typeof v === "string" && /^https?:\/\//.test(v.trim());

// ── Academic year rule (owner: latest only — 2026/27 preferred, else 2025/26) ──
/** Normalised "YYYY/YY" or null. Accepts "2026-2027", "2026/27 (computed)", 2026. */
export const academicYear = (raw: unknown): string | null => academicYearOf(raw);
export type YearStatus = "preferred" | "accepted" | "stale" | "unknown";
export function yearStatus(ay: string | null): YearStatus {
  const y = yearStart(ay);
  if (y == null) return "unknown";
  if (y >= 2026) return "preferred";
  if (y >= OLDEST_CURRENT_YEAR) return "accepted";
  return "stale";
}
/** Deadlines: entry year Y is applied for in academic year (Y-1)/Y. */
export const deadlineAcademicYear = (intake: number) => `${intake - 1}/${String(intake % 100).padStart(2, "0")}`;

// ── Tuition / money ──
const annualFactor = (period: string) => (period === "year" || period === "total" ? 1 : period === "semester" ? 2 : null);

export function tuitionOf(raw: Record<string, unknown> | null | undefined): { value: FieldValue<"tuition">; academic_year: string | null; flags: string[] } | null {
  if (!raw) return null;
  const inner = raw.value && typeof raw.value === "object" && !Array.isArray(raw.value) ? (raw.value as Record<string, unknown>) : {};
  const range = raw.range && typeof raw.range === "object" ? (raw.range as Record<string, unknown>) : {};
  let amount = num(raw.amount) ?? num(inner.amount);
  let rangeMin = num(raw.range_min) ?? num(range.min) ?? num(inner.range_min);
  let rangeMax = num(raw.range_max) ?? num(range.max) ?? num(inner.range_max);
  let { code, period } = currencyOf(raw.currency ?? inner.currency);
  const flags: string[] = [];
  if (amount == null && rangeMin == null) {
    const parsed = tuitionFromText(typeof raw.value === "string" ? raw.value : raw.basis);
    if (!parsed) return null;
    ({ amount } = parsed);
    rangeMin = parsed.range_min;
    rangeMax = parsed.range_max;
    code = parsed.currency;
    period = parsed.period;
    flags.push("parsed-from-text");
  }
  if (!code) return null;
  const yearText = str(raw.academic_year) ?? str(inner.academic_year);
  if (!period && yearText && /per semester|semester\)/i.test(yearText) && !/annual|per year|2 semesters/i.test(yearText)) period = "semester";
  const p = (period ?? "year") as FieldValue<"tuition">["period"];
  const base = amount ?? rangeMin;
  const factor = annualFactor(p);
  // Prefer our dated table; fall back to the collector's own rate only when the table has no row.
  let conv = factor != null && base != null ? toUsd(base * factor, code) : { usd: null, fx: null };
  const ownRate = num(raw.fx_rate_usd_per_unit);
  if (conv.usd == null && factor != null && base != null && ownRate && isoDayOf(raw.fx_date)) {
    conv = { usd: Math.round(base * factor * ownRate), fx: { usd_per_unit: ownRate, date: isoDayOf(raw.fx_date)!, source: str(raw.fx_source) ?? "collector-supplied rate" } };
    flags.push("fx-from-collector");
  }
  if (conv.usd == null && factor != null && base != null) flags.push("fx-missing");
  if (factor === 2) flags.push("annualised-from-semester");
  return {
    value: { amount, range_min: rangeMin, range_max: rangeMax, currency: code, period: p, usd: conv.usd, fx: conv.fx, basis: str(raw.basis) ?? str(raw.note) },
    academic_year: academicYear(yearText),
    flags,
  };
}

/** {value: 1862, note: "USD per year"}, 6216, "CHF 780 per semester", {amount, currency}. */
export function moneyOf(raw: unknown, defaultCurrency: string | null = null): FieldValue<"mandatory_fees"> | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    const { usd } = toUsd(raw, defaultCurrency);
    return { amount: raw, currency: defaultCurrency, usd, text: null };
  }
  if (typeof raw === "string") {
    const parsed = tuitionFromText(raw);
    if (parsed && parsed.amount != null) {
      const factor = annualFactor(parsed.period) ?? 1;
      return { amount: parsed.amount, currency: parsed.currency, usd: toUsd(parsed.amount * factor, parsed.currency).usd, text: raw };
    }
    return /not (found|stated|published|listed)|^n\/?a$/i.test(raw) ? null : { amount: null, currency: null, usd: null, text: raw };
  }
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const amount = num(o.amount) ?? (typeof o.value === "number" ? o.value : null);
    const currency = currencyOf(o.currency).code ?? currencyOf(o.note).code ?? defaultCurrency;
    if (amount != null) return { amount, currency, usd: toUsd(amount, currency).usd, text: str(o.note) };
    if (typeof o.value === "string") return moneyOf(o.value, defaultCurrency);
  }
  return null;
}

// ── Deadlines ──
/** Dated items must fall in the application cycle for their entry year. */
export function inCycle(date: string, intake: number) {
  return date >= `${intake - 1}-06-01` && date <= `${intake}-09-30`;
}
export function deadlinesOf(value: unknown, prov: { source_url: string; retrieved_at: string; method: Method; collector: string }): FieldValue<"deadlines"> {
  if (value == null) return [];
  // "Class of 2031" names the graduation year, not the entry year.
  const fixCycle = (c: unknown) => (typeof c === "string" && /class of/i.test(c) ? c.replace(/class of\s*20\d{2}/gi, `${INTAKE} entry`) : c);
  const items = Array.isArray(value)
    ? value.map((v) => {
      if (!v || typeof v !== "object") return v;
      const o = v as Record<string, unknown>;
      return { ...o, round: o.round ?? o.label, cycle: fixCycle(o.cycle) };
    })
    : value;
  return deadlinesFromValue(items, INTAKE).map((d) => ({ ...d, intake_year: d.intake_year > INTAKE + 1 ? INTAKE : d.intake_year })).map((d) => {
    const outside = d.due_date != null && !inCycle(d.due_date, d.intake_year);
    return {
      round: d.round, label: d.round_label, date: outside ? null : d.due_date, date_inferred: !outside && d.due_date_inferred,
      text: outside ? (d.due_text ?? d.due_date) : d.due_text, intake_year: d.intake_year, ...prov,
    };
  });
}

// ── Platform ──
export function platformValueOf(text: unknown): FieldValue<"platform"> | null {
  const label = str(text);
  if (!label) return null;
  const code = platformOf(label);
  return code ? { code, label: label.slice(0, 300) } : null;
}

// ── English tests ──
const half = (n: number) => Math.round(n * 2) / 2 === n;
const NEW_SCALE = /(on|after|from|since)[/ ]*(or after )?\s*(21\s*jan(uary)?\s*2026|january\s*21,?\s*2026|2026-01-21)|new (1[–-]6 )?scale|revised scale|1[–-]6 scale|band scale|new scale/i;

function statusFrom(text: string, hasNumber: boolean): TestStatus {
  const s = statusOf(text);
  return hasNumber && (s === "unknown" || s === "optional" || s === "not_required") && !/optional|not required/i.test(text) ? "required" : s;
}

export function ieltsOf(raw: unknown): FieldValue<"ielts"> | null {
  if (raw == null) return null;
  if (typeof raw === "number") return raw >= 4 && raw <= 9 && half(raw) ? { status: "required", overall: raw, component: null, text: null } : null;
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const overall = num(o.overall_minimum ?? o.minimum ?? o.overall);
    const component = num(o.band_minimum ?? o.component_minimum);
    const text = str(o.note);
    if (overall == null && !text) return null;
    return { status: overall != null ? "required" : text ? statusOf(text) : "unknown", overall, component, text };
  }
  const text = str(raw);
  if (!text) return null;
  const optional = /optional|not required/i.test(text);
  const nums = [...text.matchAll(/\b([4-9](?:\.[05])?)\b(?!\s*(%|years?|months?))/g)].map((m) => Number(m[1]));
  const comp = /(?:each|every|no (?:band|component|section|sub-?score)s? (?:below|less than|under)|band minimum|component|sub-?scores?|in all|minimum of)\D{0,20}([4-9](?:\.[05])?)|([4-9](?:\.[05])?)\s*(?:in )?(?:each|every|all)\b(?: (?:band|component|section|skill)s?)?/i.exec(text);
  const component = comp ? Number(comp[1] ?? comp[2]) : null;
  const overall = optional ? null : nums.find((n) => n !== component) ?? (component != null ? null : nums[0] ?? null);
  return { status: statusFrom(text, overall != null), overall, component: optional ? null : component, text };
}

/** TOEFL iBT, classic 0–120 and the 1–6 band (tests from 21 Jan 2026). */
export function toeflOf(raw: unknown): FieldValue<"toefl"> | null {
  if (raw == null) return null;
  if (typeof raw === "number") {
    if (raw >= 1 && raw <= 6 && half(raw)) return { status: "required", ibt: null, ibt_component: null, band_2026: raw, text: null };
    return raw >= 30 && raw <= 120 ? { status: "required", ibt: raw, ibt_component: null, band_2026: null, text: null } : null;
  }
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const m = num(o.minimum ?? o.overall_minimum ?? o.score);
    const note = [str(o.scale_note), str(o.note)].filter(Boolean).join("; ") || null;
    const fromNote = note ? toeflOf(note) : null;
    const ibt = m != null && m >= 30 && m <= 120 ? m : fromNote?.ibt ?? null;
    const band = m != null && m <= 6 ? m : fromNote?.band_2026 ?? null;
    if (ibt == null && band == null && !note) return null;
    return { status: ibt != null || band != null ? "required" : "unknown", ibt, ibt_component: num(o.section_minimum) ?? fromNote?.ibt_component ?? null, band_2026: band, text: note };
  }
  const text = str(raw);
  if (!text) return null;
  const optional = /optional|not required/i.test(text);
  let ibt: number | null = null, band: number | null = null, component: number | null = null;
  // Split on clause boundaries; a clause that names the new scale contributes band scores.
  for (const clause of text.split(";")) {
    const isNew = NEW_SCALE.test(clause) || /\b[1-6](?:\.[05])?\s*(new|revised|on the new)/i.test(clause);
    let cleaned = clause.replace(/21\s*jan(uary)?\s*2026|january\s*21,?\s*2026|2026-01-21|20\d{2}|1[–-]6/gi, " ");
    const sub = /(sub-?scores?|each|section|component|area)s?\D{0,12}(\d{1,3}(?:\.\d)?)/i.exec(cleaned);
    if (sub) cleaned = cleaned.replace(sub[0], " ");
    const subN = sub ? Number(sub[2]) : null;
    for (const n of [...cleaned.matchAll(/\b(\d{1,3}(?:\.\d)?)\b/g)].map((m) => Number(m[1]))) {
      if (n >= 30 && n <= 120) ibt ??= n;
      else if (n >= 1 && n <= 6 && half(n) && (isNew || /\b(4|4\.5|5|5\.5|6)(\.0)?\b\s*(overall|new|on)/i.test(clause))) band ??= n;
    }
    if (subN != null && !isNew && subN >= 1 && subN <= 30) component ??= subN;
  }
  if (optional) ibt = band = component = null;
  return { status: statusFrom(text, ibt != null || band != null), ibt, ibt_component: component, band_2026: band, text };
}

export function duolingoOf(raw: unknown): FieldValue<"duolingo"> | null {
  if (raw == null) return null;
  if (typeof raw === "number") return raw >= 10 && raw <= 160 ? { status: "required", minimum: raw, text: null } : null;
  if (typeof raw === "object") {
    const m = num((raw as Record<string, unknown>).minimum ?? (raw as Record<string, unknown>).overall_minimum);
    return m != null ? { status: "required", minimum: m, text: str((raw as Record<string, unknown>).note) } : null;
  }
  const text = str(raw);
  if (!text) return null;
  const optional = /optional|not required|not accepted/i.test(text);
  const n = [...text.matchAll(/\b(\d{2,3})\b/g)].map((m) => Number(m[1])).find((x) => x >= 60 && x <= 160) ?? null;
  return { status: statusFrom(text, n != null && !optional), minimum: optional ? null : n, text };
}

/** "TOEFL iBT 4.0 (on/after 21 Jan 2026; 70 before); IELTS 6.0; Duolingo 105" → per-test texts. */
export function splitEnglishText(text: string): { ielts: string | null; toefl: string | null; duolingo: string | null } {
  const parts = text.split(/;(?![^(]*\))/).map((s) => s.trim());
  const find = (re: RegExp) => parts.find((p) => re.test(p)) ?? null;
  return { ielts: find(/ielts/i), toefl: find(/toefl/i), duolingo: find(/duolingo|\bdet\b/i) };
}

export function satActOf(raw: unknown): FieldValue<"sat_act"> | null {
  const text = str(raw);
  if (!text) return null;
  return { policy: satActPolicyOf(text), text: text.slice(0, 500) };
}

export function acceptanceOf(raw: unknown, yearHint: number | null = null): FieldValue<"acceptance_rate"> | null {
  if (raw == null) return null;
  if (typeof raw === "number") return raw >= 0 && raw <= 100 ? { percent: raw, year: yearHint } : null;
  if (typeof raw === "object") return acceptanceOf((raw as Record<string, unknown>).percent ?? (raw as Record<string, unknown>).value, num((raw as Record<string, unknown>).year) ?? yearHint);
  const text = str(raw);
  const m = text && /(\d{1,2}(?:\.\d+)?)\s*%/.exec(text);
  if (!m) return null;
  const y = /\b(20[12]\d)\b/.exec(text!);
  return { percent: Number(m[1]), year: y ? Number(y[1]) : yearHint };
}

export function documentsOf(raw: unknown): FieldValue<"documents"> | null {
  if (!Array.isArray(raw)) return null;
  const out = raw.map((d) => str(typeof d === "string" ? d : (d as Record<string, unknown>)?.name)).filter((d): d is string => !!d).map((d) => d.slice(0, 400));
  return out.length ? out : null;
}

export function programmesOf(raw: unknown, sourceUrl: string | null): FieldValue<"programmes"> | null {
  if (!Array.isArray(raw)) return null;
  const out: FieldValue<"programmes"> = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const o = p as Record<string, unknown>;
    const name = str(o.name);
    if (!name) continue;
    const reqs = Array.isArray(o.requirements) ? (o.requirements as unknown[]).map((r) => str(typeof r === "string" ? r : (r as Record<string, unknown>)?.label)).filter(Boolean).join("; ") : str(o.requirements);
    out.push({
      name: name.slice(0, 300), faculty: str(o.faculty) ?? str(o.field), degree: str(o.degree) ?? str(o.award),
      years: num(o.years) ?? num(o.duration_years), requires: str(o.requires) ?? (reqs || null),
      source_url: isHttp(o.source_url) ? String(o.source_url) : isHttp(o.url) ? String(o.url) : sourceUrl,
    });
  }
  return out.length ? out : null;
}

export const normName = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, " ").trim();
