/** Canonicalises the five shapes of the 14 Nov 2026 admissions research files
 * into one record, parses the English minimums, fees, tuition and dated
 * deadlines that can be read without guessing, and builds the published rows. */
import { collegestatId, isValidIsoDate, parseEnglishMinimum, parseMoney, resolveMonthDay, validateMoney, validateTestMinimum, type Money, type Raw, type TestMinimum } from "./nov14-lib";

export type Leaf = { value: unknown; source_url: string | null; checked_at: string | null };
export const FIELDS = ["ielts", "toefl", "duolingo", "english_waivers", "application_route", "application_fee", "deadlines", "tuition", "aid", "central_asian_scholarship", "foundation_year"] as const;
export type FieldName = (typeof FIELDS)[number];

const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const empty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length) || (isObj(v) && !Object.keys(v).length);

export function leaf(x: unknown): Leaf {
  if (isObj(x) && "value" in x) return { value: empty(x.value) ? null : x.value, source_url: typeof x.source_url === "string" ? x.source_url : null, checked_at: typeof x.checked_at === "string" ? x.checked_at : null };
  return { value: empty(x) ? null : x, source_url: null, checked_at: null };
}
const textOf = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return String(v);
  return JSON.stringify(v);
};

export type Tuition = { amount: number; currency: string; period: "year"; note: string | null };
export type DatedDeadline = { label: string; date: string; cycle: string | null };
export type Parsed = { ielts?: TestMinimum; toefl?: TestMinimum; fee?: Money; tuition?: Tuition; deadlines?: DatedDeadline[] };
export type Canonical = {
  university_id: string;
  name: string;
  country: string | null;
  fields: Record<FieldName, Leaf>;
  parsed: Parsed;
  sources: string[];
  /** Which input file shape the record came from. */
  shape: "base" | "p1" | "p2" | "p3" | "p4";
};

const nullLeaf = (): Leaf => ({ value: null, source_url: null, checked_at: null });

function routeText(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  if (isObj(v)) {
    if (typeof v.route === "string") return v.route;
    if (Array.isArray(v.routes)) return v.routes.map(String).join("; ");
  }
  return null;
}

/** A fee from a structured object, a number with a currency, or a sentence naming exactly one amount. */
export function feeFrom(v: unknown, currency?: unknown): Money | null {
  if (isObj(v)) {
    const f = v.application_fee;
    if (isObj(f)) return parseMoney(f.amount, f.currency);
    if (typeof f === "string") return feeFrom(f);
    if (typeof v.route === "string" && f === undefined) return feeFrom(v.route);
    return null;
  }
  if (typeof v === "string") {
    const found = v.split(/;/).map((seg) => parseMoney(seg)).filter((m): m is Money => !!m);
    return found.length === 1 ? found[0] : null;
  }
  return parseMoney(v, currency);
}

const YEAR_UNIT = /^([A-Z]{3})(?:\s?\/\s?year|\s+per\s+year)?(?:\b.*)?$/;
/** A single annual tuition figure; null when the source gives ranges, programme lists or per-credit prices. */
export function tuitionFrom(v: unknown, currency?: unknown): Tuition | null {
  if (typeof v === "string") {
    const hits = [...v.matchAll(/(?:(?:USD|EUR|GBP|CAD|JPY|CNY|RMB|HKD|SGD|KRW|TRY|CZK|PLN|KZT|UZS|RUB)\s?\d[\d,]*(?:\.\d+)?|[€$£]\s?\d[\d,]*|\d[\d,]*\s?(?:USD|EUR|CAD|JPY|RMB|HKD|SGD))\s*(?:per (?:academic )?year|\/year|annual)/gi)];
    if (hits.length !== 1 || /semester|range|varies|vary|programme-specific|except|\bto\b/i.test(v)) return null;
    const money = parseMoney(hits[0][0].replace(/\s*(per (academic )?year|\/year|annual)/i, ""));
    return money ? { amount: money.amount, currency: money.currency, period: "year", note: v } : null;
  }
  if (isObj(v)) {
    const amount = v.amount ?? v.amount_per_year;
    const cur = String(v.currency ?? currency ?? "");
    const m = cur.match(YEAR_UNIT);
    const explicitlyOther = /per (credit|semester|month)|\/semester/i.test(cur);
    if (!m || explicitlyOther) return null;
    if (typeof amount === "string" && /[–-]|to|vary|programme/i.test(amount) && !/^\d[\d,.]*$/.test(amount)) return null;
    const money = parseMoney(typeof amount === "string" ? amount.replace(/,/g, "") : amount, m[1]);
    if (!money) return null;
    const note = [v.academic_year, v.academic_years, v.year, v.note, v.basis, v.programmes].filter((x) => typeof x === "string").join(" · ") || null;
    return { ...money, period: "year", note };
  }
  return null;
}

const DEADLINE_KEYS: Record<string, string> = {
  close: "Applications close", closes: "Applications close", regular_deadline: "Regular deadline", main_round: "Main round",
  first_round: "First round", first_round_deadline: "First round", second_round_deadline: "Second round", priority: "Priority deadline",
  advance_offer_deadline: "Advance offer deadline", fall: "Fall entry", winter: "Winter entry", summer: "Summer entry",
};
export function deadlinesFrom(v: unknown): DatedDeadline[] {
  const out: DatedDeadline[] = [];
  if (Array.isArray(v)) {
    for (const d of v) {
      if (!isObj(d) || typeof d.round !== "string" || typeof d.date !== "string") continue;
      const cycle = typeof d.cycle === "string" ? d.cycle : null;
      const date = /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : resolveMonthDay(d.date, cycle ?? "");
      if (date && cycle && /2027/.test(cycle)) out.push({ label: d.round, date, cycle });
    }
    return out;
  }
  if (!isObj(v)) return out;
  const cycle = textOf(v.cycle ?? v.cycle_year);
  if (!cycle || !/2027/.test(cycle)) return out;
  const grab = (o: Raw) => {
    for (const [k, val] of Object.entries(o)) {
      if (isObj(val)) grab(val);
      else if (k in DEADLINE_KEYS && typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val)) out.push({ label: DEADLINE_KEYS[k], date: val, cycle });
    }
  };
  grab(v);
  return out;
}

export function canonicalise(r: Raw): Canonical {
  const f = Object.fromEntries(FIELDS.map((k) => [k, nullLeaf()])) as Record<FieldName, Leaf>;
  const parsed: Parsed = {};
  let shape: Canonical["shape"];
  const dictLeaf = (e: Leaf, ...keys: string[]): Leaf => {
    const d = isObj(e.value) ? e.value : {};
    for (const k of keys) if (!empty(d[k])) return { ...e, value: d[k] };
    return { ...e, value: null };
  };
  if ("english_ielts" in r) {
    shape = "p2";
    f.ielts = leaf(r.english_ielts); f.toefl = leaf(r.english_toefl_ibt); f.duolingo = leaf(r.english_duolingo); f.english_waivers = leaf(r.english_waivers);
    f.application_route = leaf(r.application_route); f.application_fee = leaf(r.application_fee);
    f.deadlines = leaf(r.deadlines); f.tuition = leaf(r.international_tuition); f.aid = leaf(r.international_aid);
    f.central_asian_scholarship = leaf(r.central_asian_cis_scholarships); f.foundation_year = leaf(r.foundation_for_11_year_schooling);
    parsed.ielts = parseEnglishMinimum("IELTS", f.ielts.value) ?? undefined;
    parsed.toefl = parseEnglishMinimum("TOEFL", f.toefl.value) ?? undefined;
    parsed.fee = feeFrom(f.application_fee.value) ?? undefined;
    parsed.tuition = tuitionFrom(f.tuition.value) ?? undefined;
  } else if ("tuition" in r && isObj(r.tuition) && "amount" in r.tuition) {
    shape = "p3";
    const e = r.english as Raw, a = r.application as Raw, t = r.tuition as Raw, d = r.deadlines as Raw;
    const ov = leaf(e.ielts_academic_overall), band = leaf(e.ielts_min_band);
    f.ielts = ov.value === null && band.value === null ? ov : { ...ov, value: band.value === null ? ov.value : `${textOf(ov.value) ?? "overall not stated"}; minimum band ${textOf(band.value)}` };
    f.toefl = leaf(e.toefl_ibt); f.duolingo = leaf(e.duolingo); f.english_waivers = leaf(e.waivers);
    f.application_route = leaf(a.route);
    const amt = leaf(a.fee_amount), cur = leaf(a.fee_currency);
    f.application_fee = amt.value === null ? amt : { ...amt, value: `${textOf(cur.value) ?? ""} ${textOf(amt.value)}`.trim() };
    const dl = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, leaf(v)]));
    const parts = Object.entries(dl).filter(([, l]) => l.value !== null);
    f.deadlines = parts.length ? { value: Object.fromEntries(parts.map(([k, l]) => [k, l.value])), source_url: parts[0][1].source_url, checked_at: parts[0][1].checked_at } : nullLeaf();
    const ta = leaf(t.amount), tc = leaf(t.currency), ty = leaf(t.academic_year);
    f.tuition = ta.value === null && ty.value === null ? ta : { value: { amount: ta.value, currency: tc.value, academic_year: ty.value }, source_url: ta.source_url ?? ty.source_url, checked_at: ta.checked_at ?? ty.checked_at };
    f.aid = leaf(r.aid); f.foundation_year = leaf(r.foundation);
    parsed.ielts = parseEnglishMinimum("IELTS", ov.value) ?? undefined;
    if (parsed.ielts && typeof band.value === "string" && /^\d(\.\d)?$/.test(band.value)) parsed.ielts.component = Number(band.value);
    parsed.toefl = parseEnglishMinimum("TOEFL", f.toefl.value) ?? undefined;
    parsed.fee = parseMoney(amt.value, cur.value) ?? undefined;
    const tv = f.tuition.value as Raw | null;
    if (tv && typeof tv.amount === "number" && typeof tv.currency === "string")
      parsed.tuition = { amount: tv.amount, currency: tv.currency.toUpperCase(), period: "year", note: typeof tv.academic_year === "string" ? tv.academic_year : null };
  } else {
    shape = "tuition_per_year" in r ? "base" : "application_route_and_fee" in r ? ("international_aid" in r && "central_asian_cis_scholarship" in r ? "p1" : "p4") : "base";
    const e = leaf(r.english);
    f.ielts = dictLeaf(e, "IELTS Academic", "IELTS"); f.toefl = dictLeaf(e, "TOEFL iBT", "TOEFL"); f.duolingo = dictLeaf(e, "Duolingo English Test", "Duolingo");
    f.english_waivers = dictLeaf(e, "waivers");
    const app = leaf(r.application ?? r.application_route_and_fee);
    f.application_route = { ...app, value: routeText(app.value) };
    const fee = feeFrom(app.value);
    f.application_fee = fee || (isObj(app.value) && !empty(app.value.application_fee)) ? { ...app, value: isObj(app.value) ? (app.value.application_fee ?? null) : app.value } : nullLeaf();
    parsed.fee = fee ?? undefined;
    f.deadlines = leaf(r.deadlines);
    f.tuition = leaf(r.tuition_per_year ?? r.international_tuition_per_year);
    f.aid = leaf(r.aid ?? r.international_aid);
    f.central_asian_scholarship = leaf(r.central_asian_scholarship ?? r.central_asian_cis_scholarship);
    f.foundation_year = leaf(r.foundation_year ?? r.foundation_for_11_year_certificate);
    parsed.ielts = parseEnglishMinimum("IELTS", f.ielts.value) ?? undefined;
    parsed.toefl = parseEnglishMinimum("TOEFL", f.toefl.value) ?? undefined;
    parsed.tuition = tuitionFrom(f.tuition.value) ?? undefined;
  }
  const dl = deadlinesFrom(f.deadlines.value);
  if (dl.length) parsed.deadlines = dl;
  for (const k of Object.keys(parsed) as (keyof Parsed)[]) if (parsed[k] === undefined) delete parsed[k];

  const sources = new Set<string>();
  for (const l of Object.values(f)) if (l.source_url) sources.add(l.source_url);
  for (const s of Array.isArray(r.sources) ? r.sources : []) {
    const u = typeof s === "string" ? s : isObj(s) ? (s.url ?? s.source_url) : null;
    if (typeof u === "string" && /^https?:/.test(u)) sources.add(u);
  }
  return { university_id: String(r.university_id), name: String(r.name), country: typeof r.country === "string" ? r.country : null, fields: f, parsed, sources: [...sources], shape };
}

/** Problems with a record's parsed numbers (empty when sane). */
export function parsedIssues(p: Parsed): string[] {
  const out: string[] = [];
  if (p.ielts) { const e = validateTestMinimum("IELTS", p.ielts); if (e) out.push(e); }
  if (p.toefl) { const e = validateTestMinimum("TOEFL", p.toefl); if (e) out.push(e); }
  if (p.fee) { const e = validateMoney(p.fee); if (e) out.push(`application fee: ${e}`); }
  if (p.tuition) { const e = validateMoney(p.tuition); if (e) out.push(`tuition: ${e}`); }
  for (const d of p.deadlines ?? []) if (!isValidIsoDate(d.date)) out.push(`deadline date does not parse: ${d.date}`);
  return out;
}

// --- published rows ---------------------------------------------------------

const RETRIEVED = "2026-11-14";
const dataSources = (c: Canonical, url: string, what: string, licence: string) => ({
  id: collegestatId("segment-source-nov14", url),
  name: `${c.name} · ${what}`,
  organization: c.name,
  url,
  source_type: "official",
  license_notes: licence,
  retrieved_at: RETRIEVED,
  trust_level: "medium",
});
const LICENCE = "Paraphrased official admissions guidance; confirm current conditions on the university website.";
const clip = (s: string, n = 300) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export function requirementRow(c: Canonical, kind: "IELTS" | "TOEFL", m: TestMinimum, url: string): Raw {
  const label = kind === "IELTS" ? "IELTS Academic · overall" : m.scale === "toefl6" ? "TOEFL iBT · current 1–6 scale" : "TOEFL iBT · 0–120 scale";
  const original = textOf(c.fields[kind === "IELTS" ? "ielts" : "toefl"].value) ?? "";
  const notes = [m.component ? `No component below ${m.component}.` : null, `Source wording: ${clip(original, 220)}`].filter(Boolean).join(" ");
  return {
    id: collegestatId("segment-requirements-nov14", `${c.university_id}|${kind}|${m.scale}`),
    university_id: c.university_id,
    program_id: null,
    kind,
    label,
    minimum: m.minimum,
    maximum: null,
    student_category: "First-year undergraduate applicants who need English proficiency evidence",
    required: null,
    year: null,
    source_id: collegestatId("segment-source-nov14", url),
    source_url: url,
    verification_status: "verified",
    verified_at: RETRIEVED,
    notes,
    evidence: { university_wide: true, scope: "First-year undergraduate admission", population: "International applicants", retrieved_at: RETRIEVED, scale: kind === "IELTS" ? "IELTS 0–9" : m.scale === "toefl6" ? "TOEFL iBT 1–6" : "TOEFL iBT 0–120", license_note: LICENCE },
    data_sources: dataSources(c, url, "English language requirement", LICENCE),
  };
}

export function feeRow(c: Canonical, fee: Money, url: string): Raw {
  const original = textOf(c.fields.application_fee.value) ?? "";
  const year = /2027/.test(original) ? 2027 : null;
  return {
    id: collegestatId("segment-fees-nov14", `${c.university_id}|application_fee`),
    university_id: c.university_id,
    program_id: null,
    category: "application_fee",
    amount: fee.amount,
    currency: fee.currency,
    period: "total",
    student_category: "International first-year applicants",
    year,
    source_id: collegestatId("segment-source-nov14", url),
    source_url: url,
    verification_status: "verified",
    verified_at: RETRIEVED,
    confidence: "medium",
    notes: `Application fee as the university states it. Source wording: ${clip(original, 220)}`,
    evidence: { university_wide: false, scope: "admissions_route", population: "International first-year applicants", reporting_period: year ? "2027 entry" : "latest published", retrieved_at: RETRIEVED, fee_type: "application", annual_tuition: false },
    data_sources: dataSources(c, url, "application fee", LICENCE),
  };
}

export function dateRow(c: Canonical, d: DatedDeadline, url: string): Raw {
  return {
    id: collegestatId("segment-dates-nov14", `${c.university_id}|${d.date}|${d.label}`),
    university_id: c.university_id,
    title: d.label === "Applications close" ? "Undergraduate applications close" : `Undergraduate application: ${d.label.toLowerCase()}`,
    student_category: "International first-year applicants",
    cycle: d.cycle ?? "2027 entry",
    due_at: d.date,
    due_date: d.date,
    timezone: "Not stated",
    application_url: url,
    year: 2027,
    source_id: collegestatId("segment-source-nov14", url),
    source_url: url,
    verification_status: "verified",
    verified_at: RETRIEVED,
    notes: "Date only; the university does not state a cutoff time in the source. Confirm with the university.",
    data_sources: dataSources(c, url, "application dates", LICENCE),
  };
}
