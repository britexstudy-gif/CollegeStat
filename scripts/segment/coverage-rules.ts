// Pure field-classification rules for the segment coverage report
// (scripts/segment/coverage.ts). No I/O here so tests can use small fixtures.
//
// For each field we collect "evidence" from every place the profile page can
// show it, then decide three things:
//   present  – at least one stored value (a null amount is NOT a value; 0 is)
//   sourced  – at least one value carries an http(s) source/provenance URL
//   current  – a sourced value refers to the cycle the segment applies for
// Nothing is estimated: a year is only read from structured period/cycle/scope
// fields or the record's own `year`, never guessed from a retrieval date.
import type { University } from "@/lib/domain";
import type { UniversityEnrichment } from "@/lib/university-enrichment";

export type YearRef = { start: number | null; label: string };
export type Evidence = {
  origin: string;
  detail: string;
  url: string | null;
  year: YearRef;
  currency?: string | null;
  /** Links only: when the link itself was last checked (YYYY-MM-DD). */
  checked?: string | null;
};
export type Verdict = { present: boolean; sourced: boolean; current: boolean; year: string; detail: string; evidence: Evidence[] };

export const FIELDS = [
  "tuition",
  "living_cost",
  "requirements",
  "english_minimum",
  "deadline",
  "application_fee",
  "scholarships",
  "admissions_link",
  "international_link",
  "website",
] as const;
export type FieldKey = (typeof FIELDS)[number];
export const FIELD_LABELS: Record<FieldKey, string> = {
  tuition: "Tuition (currency + year)",
  living_cost: "Living cost",
  requirements: "Admission requirements (general)",
  english_minimum: "English test minimum",
  deadline: "Application deadline",
  application_fee: "Application fee",
  scholarships: "Linked scholarships",
  admissions_link: "Official admissions page",
  international_link: "International students page",
  website: "Main website",
};

/** What the coverage script hands the rules: the profile as the page receives it
 * (bundled shard + server overlays) plus the reviewed enrichment record. */
export type ProfileInput = Pick<University, "id" | "slug" | "name" | "country_code" | "website"> &
  Partial<
    Pick<
      University,
      | "costs" | "requirements" | "deadlines" | "admissions" | "financial_aid" | "university_scholarships"
      | "application_brief" | "official_web" | "admissions_url" | "application_url" | "financial_aid_url"
      | "net_price_url" | "reference_url" | "reference_retrieved_at" | "us_stats" | "common_app" | "scorecard"
    >
  > & {
    enrichment?: Pick<UniversityEnrichment, "costs" | "admissions" | "resources" | "checked_at"> | null;
    /** Dataset-level source for us_stats (the per-row object has none). */
    us_stats_source?: { url: string; academic_year: string } | null;
  };

export type Context = {
  /** Run date (YYYY-MM-DD); links checked within LINK_FRESH_DAYS of it are current. */
  today: string;
};
export const LINK_FRESH_DAYS = 365;
/** Tuition, living cost and requirements describe an academic year: 2026–27 or 2027–28. */
export const CURRENT_ACADEMIC_STARTS = [2026, 2027];
/** Deadlines, fees and scholarship rounds must be the 2027-entry round, because
 * a 2026-entry deadline has already passed for this segment. */
export const CURRENT_CYCLE_STARTS = [2027];
const CYCLE_FIELDS: FieldKey[] = ["deadline", "application_fee", "scholarships"];
const LINK_FIELDS: FieldKey[] = ["admissions_link", "international_link", "website"];

const NONE: YearRef = { start: null, label: "year not stated" };

/** Academic-year start from a period/cycle text. "2026–27" → 2026;
 * "2027 entry" / "Autumn 2027" → 2027; "Spring 2027" → 2026 (that intake sits in
 * the 2026–27 year). A lone year is used only when it is the only one in the text. */
export function parseAcademicYear(text: string | null | undefined, strict = false): YearRef {
  if (!text) return NONE;
  const range = text.match(/\b(20\d{2})\s*[–—\-\/]\s*(?:20)?(\d{2})\b/);
  if (range) {
    const start = Number(range[1]);
    if ((start + 1) % 100 === Number(range[2])) return { start, label: `${start}–${String(start + 1).slice(2)}` };
  }
  // A month alone ("from January 2026") is often a test or policy date, so
  // spring intakes need an intake word next to them.
  const spring =
    text.match(/\b(?:spring|january|winter)\s+(?:semester|intake|entry)\s+(20\d{2})\b/i) ||
    text.match(/\b(?:spring|january|winter)\s+(20\d{2})\s+(?:semester|intake|entry)\b/i);
  if (spring) return { start: Number(spring[1]) - 1, label: `${spring[0]} (in ${Number(spring[1]) - 1}–${spring[1].slice(2)})` };
  const intake =
    text.match(/\b(20\d{2})\s+(?:entry|intake|admissions?|cycle|semester|academic year)\b/i) ||
    text.match(/\b(?:autumn|fall)\s+(?:semester\s+|intake\s+)?(20\d{2})\b/i) ||
    text.match(/\b(?:entry|intake|admission)\s+(?:in\s+)?(20\d{2})\b/i);
  if (intake) return { start: Number(intake[1]), label: intake[0] };
  if (strict) return NONE;
  const years = [...new Set(text.match(/\b20\d{2}\b/g) ?? [])];
  if (years.length === 1) return { start: Number(years[0]), label: `${years[0]} (only year stated)` };
  return NONE;
}

/** Year of a free-text fact: its period/scope field first, then only an explicit
 * range or intake phrase inside the text itself ("for 2027 entry"); a bare date
 * such as "13 January 2027" is not enough. */
export function textYear(period: string | null | undefined, ...texts: (string | null | undefined)[]): YearRef {
  const y = parseAcademicYear(period);
  if (y.start != null) return y;
  const stated = parseAcademicYear(texts.filter(Boolean).join(" \n "), true);
  return stated.start != null ? { start: stated.start, label: `${stated.label} (stated in text)` } : NONE;
}

/** First parseable of several texts, then the record's own numeric `year`. */
export function resolveYear(texts: (string | null | undefined)[], year?: number | null): YearRef {
  for (const t of texts) {
    const y = parseAcademicYear(t);
    if (y.start != null) return y;
  }
  return year != null ? { start: year, label: `year ${year}` } : NONE;
}

const CODES = "USD|GBP|EUR|CAD|AUD|SGD|HKD|KRW|JPY|CNY|RMB|MYR|TRY|HUF|PLN|CZK|RUB|AED|UZS|KZT|KGS|TJS|CHF";
/** A money amount: a currency next to a number, or a number with thousands
 * separators. Bare years ("fall 2026") are not amounts. */
const AMOUNT = new RegExp(`(?:\\b(?:${CODES})|[£€₩$¥])\\s?\\d|\\d[\\d,.]*\\s?(?:${CODES})\\b|\\b\\d{1,3}(?:,\\d{3})+\\b`);

/** The sentences of a text fact that mention `keyword` and state an amount;
 * "Living costs are additional." names a cost but gives no value. */
export function valueSentences(text: string, keyword: RegExp): string[] {
  return text.split(/(?<=[.;])\s+/).filter((s) => keyword.test(s) && AMOUNT.test(s));
}

/** Amount-bearing text for a keyword: sentences naming it with an amount, or,
 * when the title names it ("Edinburgh living-cost estimate"), the body's amounts. */
export function factAmounts(title: string, body: string, keyword: RegExp): string[] {
  const hits = valueSentences(title + ". " + body, keyword);
  if (hits.length || !keyword.test(title)) return hits;
  return valueSentences(body, /./);
}

/** Records that only apply to graduate applicants (an Executive MBA deadline,
 * a graduate fellowship) say nothing about a bachelor's application.
 * "undergraduate" does not match because \b needs a word start. */
const GRADUATE_ONLY = /\b(MBA|master'?s?|postgraduate|graduate|PhD|doctoral|Knight-Hennessy)\b/i;
export const graduateOnly = (...texts: (string | null | undefined)[]) =>
  texts.some((t) => !!t && GRADUATE_ONLY.test(t)) && !texts.some((t) => !!t && /undergraduate|bachelor|first-year|freshm/i.test(t));

const ISO = new RegExp(`\\b(${CODES})\\b`);
const SYMBOL: Record<string, string> = { "£": "GBP", "€": "EUR", "₩": "KRW" };
/** Currency named in a text fact. "$" and "¥" are ambiguous and are not mapped. */
export function currencyInText(text: string): string | null {
  const iso = text.match(ISO)?.[1];
  if (iso) return iso === "RMB" ? "CNY" : iso;
  for (const [s, code] of Object.entries(SYMBOL)) if (text.includes(s)) return code;
  return null;
}

export const isUrl = (u: string | null | undefined): u is string => !!u && /^https?:\/\//i.test(u);
const urlOf = (r: { source_url?: string; data_sources?: { url: string } | null }) =>
  (isUrl(r.source_url) ? r.source_url : null) ?? (isUrl(r.data_sources?.url) ? r.data_sources!.url : null);

const ENGLISH_KINDS = /^(ielts|toefl|duolingo|det|pte)$/i;
const ENGLISH_TEXT = /\b(IELTS|TOEFL|Duolingo|PTE Academic)\b/i;
const NO_ENGLISH_TEST = /(does not|doesn't|do not|no longer) require[^.]*English|English[^.]*(test|exam)[^.]*not required/i;

// ---- per-field evidence collectors --------------------------------------

function tuitionEvidence(p: ProfileInput): Evidence[] {
  const rows: Evidence[] = (p.costs ?? [])
    // In-state US rates never apply to this segment.
    .filter((c) => c.category === "tuition" && c.student_category !== "in_state" && c.amount != null && !graduateOnly(c.student_category, c.evidence?.population))
    .map((c) => ({
      origin: "costs",
      detail: `${c.amount} ${c.currency} · ${c.student_category}${c.student_category === "out_of_state" ? " (US out-of-state rate, not a verified international price)" : ""}`,
      url: urlOf(c),
      year: resolveYear([c.evidence?.reporting_period], c.year),
      currency: c.currency || null,
    }));
  if (p.us_stats?.tuition_out_state != null)
    rows.push({
      origin: "ipeds-us-stats",
      detail: `${p.us_stats.tuition_out_state} USD · US out-of-state rate (not a verified international price)`,
      url: p.us_stats_source?.url ?? null,
      year: resolveYear([p.us_stats_source?.academic_year]),
      currency: "USD",
    });
  // Aid facts mention tuition ("aid covers at least tuition") without pricing it.
  for (const f of p.enrichment?.costs ?? []) {
    if (AID_TITLE.test(f.title)) continue;
    const hits = factAmounts(f.title, f.body, TUITION_TEXT);
    if (hits.length)
      rows.push({ origin: "reviewed-text", detail: f.title, url: f.source_url, year: textYear(f.reporting_period, f.title, f.body), currency: currencyInText(hits.join(" ")) ?? currencyInText(f.title + " " + f.body) });
  }
  return rows;
}

const TUITION_TEXT = /tuition|course fees?|annual (?:course )?fees?|per (?:[a-z]+ )?(?:academic )?year/i;
const AID_TITLE = /need-based|financial aid|scholarship|grant|net price/i;
const LIVING_TEXT = /living|accommodation|housing|room and board|food|meal/i;
const LIVING = /room_board|housing|accommodation|living|food|meal/i;
function livingEvidence(p: ProfileInput): Evidence[] {
  const rows: Evidence[] = (p.costs ?? [])
    .filter((c) => LIVING.test(c.category) && c.amount != null)
    .map((c) => ({
      origin: "costs",
      detail: `${c.category} ${c.amount} ${c.currency} · ${c.student_category}`,
      url: urlOf(c),
      year: resolveYear([c.evidence?.reporting_period], c.year),
      currency: c.currency || null,
    }));
  if (p.us_stats?.room_board != null)
    rows.push({ origin: "ipeds-us-stats", detail: `room & board ${p.us_stats.room_board} USD`, url: p.us_stats_source?.url ?? null, year: resolveYear([p.us_stats_source?.academic_year]), currency: "USD" });
  for (const f of p.enrichment?.costs ?? []) {
    const hits = factAmounts(f.title, f.body, LIVING_TEXT);
    if (hits.length)
      rows.push({ origin: "reviewed-text", detail: f.title, url: f.source_url, year: textYear(f.reporting_period, f.title, f.body), currency: currencyInText(hits.join(" ")) });
  }
  return rows;
}

function requirementsEvidence(p: ProfileInput): Evidence[] {
  const rows: Evidence[] = (p.requirements ?? [])
    .filter((r) => !ENGLISH_KINDS.test(r.kind) && !graduateOnly(r.student_category))
    .map((r) => ({
      origin: "requirements",
      detail: `${r.kind}: ${r.label}`,
      url: urlOf(r),
      year: resolveYear([r.evidence?.reporting_period], r.year),
    }));
  const b = p.application_brief;
  if (b?.requirements.length)
    rows.push({ origin: "application-brief", detail: `${b.requirements.length} listed steps`, url: isUrl(b.requirements_source) ? b.requirements_source : null, year: textYear(b.scope, ...b.requirements) });
  for (const f of p.enrichment?.admissions ?? [])
    rows.push({ origin: "reviewed-text", detail: f.title, url: f.source_url, year: textYear(f.reporting_period, f.title, f.body) });
  if (p.common_app)
    rows.push({ origin: "common-app", detail: "Common App first-year requirement flags (season not stated)", url: isUrl(p.common_app.url) ? p.common_app.url : null, year: NONE });
  return rows;
}

function englishEvidence(p: ProfileInput): Evidence[] {
  const rows: Evidence[] = (p.requirements ?? [])
    .filter((r) => (ENGLISH_KINDS.test(r.kind) || ENGLISH_TEXT.test(r.label)) && r.minimum != null && !graduateOnly(r.student_category))
    .map((r) => ({
      origin: "requirements",
      detail: `${r.label} ≥ ${r.minimum}${r.program_id ? " (programme-specific)" : ""}`,
      url: urlOf(r),
      year: resolveYear([r.evidence?.reporting_period], r.year),
    }));
  for (const a of p.admissions ?? [])
    if (a.ielts_min != null || a.toefl_min != null)
      rows.push({ origin: "admissions", detail: `IELTS ${a.ielts_min ?? "?"} / TOEFL ${a.toefl_min ?? "?"}`, url: urlOf(a), year: resolveYear([a.evidence?.reporting_period], a.year) });
  // Text counts only with a stated score, or an explicit "no English test required".
  const textual = (t: string) => (ENGLISH_TEXT.test(t) && /\d/.test(t)) || NO_ENGLISH_TEST.test(t);
  for (const f of p.enrichment?.admissions ?? [])
    if (textual(f.title + ". " + f.body)) rows.push({ origin: "reviewed-text", detail: f.title, url: f.source_url, year: textYear(f.reporting_period, f.title, f.body) });
  const b = p.application_brief;
  for (const line of b?.requirements ?? [])
    if (textual(line)) rows.push({ origin: "application-brief", detail: line.slice(0, 80), url: isUrl(b?.requirements_source) ? b!.requirements_source : null, year: textYear(b?.scope, ...(b?.requirements ?? [])) });
  return rows;
}

const MONTH = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\d{4}-\d{2}-\d{2}/i;
function deadlineEvidence(p: ProfileInput): Evidence[] {
  const rows: Evidence[] = (p.deadlines ?? []).filter((d) => !graduateOnly(d.title, d.student_category)).map((d) => ({
    origin: "deadlines",
    detail: `${d.title} · ${(d.due_date || d.due_at || "").slice(0, 10)} · ${d.cycle}`,
    url: urlOf(d) ?? (isUrl(d.application_url) ? d.application_url : null),
    year: resolveYear([d.cycle, d.evidence?.reporting_period], d.year),
  }));
  for (const a of p.admissions ?? [])
    if (a.deadline) rows.push({ origin: "admissions", detail: `deadline ${a.deadline}`, url: urlOf(a), year: resolveYear([a.evidence?.reporting_period], a.year) });
  for (const f of p.enrichment?.admissions ?? [])
    if (/deadline/i.test(f.title + " " + f.body) && MONTH.test(f.body))
      rows.push({ origin: "reviewed-text", detail: f.title, url: f.source_url, year: textYear(f.reporting_period, f.title, f.body) });
  const b = p.application_brief;
  for (const line of b?.requirements ?? [])
    if (/deadline/i.test(line) && MONTH.test(line))
      rows.push({ origin: "application-brief", detail: line.slice(0, 80), url: isUrl(b?.requirements_source) ? b!.requirements_source : null, year: textYear(b?.scope, ...(b?.requirements ?? [])) });
  return rows;
}

function feeEvidence(p: ProfileInput): Evidence[] {
  const rows: Evidence[] = (p.costs ?? [])
    .filter((c) => c.category === "application_fee" && c.amount != null && !graduateOnly(c.student_category, c.evidence?.population))
    .map((c) => ({
      origin: "costs",
      detail: `${c.amount} ${c.currency} · ${c.student_category}`,
      url: urlOf(c),
      year: resolveYear([c.evidence?.reporting_period], c.year),
      currency: c.currency || null,
    }));
  for (const a of p.admissions ?? [])
    if (a.application_fee != null) rows.push({ origin: "admissions", detail: `fee ${a.application_fee}`, url: urlOf(a), year: resolveYear([a.evidence?.reporting_period], a.year) });
  if (p.us_stats?.app_fee_ug != null)
    rows.push({ origin: "ipeds-us-stats", detail: `${p.us_stats.app_fee_ug} USD undergraduate application fee`, url: p.us_stats_source?.url ?? null, year: resolveYear([p.us_stats_source?.academic_year]), currency: "USD" });
  // "charges_fee: false" is a stated zero. "true" says a fee exists but not how
  // much, so it is not a value (unknown is never zero, nor any other number).
  if (p.common_app?.charges_fee === false)
    rows.push({ origin: "common-app", detail: "no fee via Common App (season not stated)", url: isUrl(p.common_app.url) ? p.common_app.url : null, year: NONE });
  for (const f of p.enrichment?.admissions ?? [])
    if (/application fee/i.test(f.title + " " + f.body) && /\d/.test(f.body))
      rows.push({ origin: "reviewed-text", detail: f.title, url: f.source_url, year: textYear(f.reporting_period, f.title, f.body), currency: currencyInText(f.body) });
  return rows;
}

function scholarshipEvidence(p: ProfileInput): Evidence[] {
  const rows: Evidence[] = (p.university_scholarships ?? []).flatMap((l) =>
    l.scholarships && !graduateOnly(l.scholarships.level, l.scholarships.name)
      ? [{
          origin: "scholarships",
          detail: l.scholarships.name,
          url: urlOf(l.scholarships) ?? (isUrl(l.scholarships.application_url) ? l.scholarships.application_url : null),
          year: resolveYear([l.scholarships.evidence?.reporting_period], l.scholarships.year),
        }]
      : [],
  );
  for (const a of p.financial_aid ?? [])
    rows.push({ origin: "financial-aid", detail: a.name, url: urlOf(a) ?? (isUrl(a.application_url) ? a.application_url : null), year: resolveYear([a.evidence?.reporting_period], a.year) });
  // application_brief.scholarships are stored but the profile page does not show
  // them (spot check, Manchester), so they are not "linked" scholarships; the
  // report counts them separately via briefScholarshipNames.
  return rows;
}

/** Scholarship names held only in an application brief (not shown on the page). */
export const briefScholarshipNames = (p: ProfileInput) => (p.application_brief?.scholarships ?? []).map((s) => s.name);

const linkYear = (checked: string | null | undefined): YearRef => ({ start: null, label: checked ? `checked ${checked.slice(0, 10)}` : "check date not stored" });
function link(origin: string, url: string | null | undefined, provenance: string | null | undefined, checked: string | null | undefined): Evidence[] {
  // A link is "sourced" when we know which official page or registry it came from.
  return isUrl(url) ? [{ origin, detail: url, url: isUrl(provenance) ? provenance : null, year: linkYear(checked), checked: checked?.slice(0, 10) ?? null }] : [];
}

function admissionsLinkEvidence(p: ProfileInput): Evidence[] {
  const web = p.official_web;
  const rows = [
    ...link("official-web", web?.links.admissions?.url, web?.source_url, web?.checked_at),
    // admissions_url comes from the official homepage crawl when it equals that link,
    // otherwise from the identity registry row (IPEDS/ROR) behind reference_url.
    ...(p.admissions_url && p.admissions_url !== web?.links.admissions?.url
      ? link("directory", p.admissions_url, p.reference_url, p.reference_retrieved_at)
      : []),
    ...(p.application_url ? link("directory-application", p.application_url, p.reference_url, p.reference_retrieved_at) : []),
  ];
  for (const r of p.enrichment?.resources ?? []) if (r.kind === "admissions") rows.push(...link("reviewed-resource", r.url, r.url, r.checked_at));
  return rows;
}

const hostAndPath = (u: string) => {
  try {
    const url = new URL(u);
    return url.hostname + url.pathname;
  } catch {
    return "";
  }
};
const APPLICANT_KINDS = new Set(["admissions", "requirements", "scholarships"]);
const INTERNATIONAL = /international|intl|overseas|non-?local|foreign/i;
function internationalLinkEvidence(p: ProfileInput): Evidence[] {
  const rows: Evidence[] = [];
  const web = p.official_web;
  // Research/programme links ("international conference") are not applicant pages.
  for (const [kind, l] of Object.entries(web?.links ?? {}))
    if (APPLICANT_KINDS.has(kind) && INTERNATIONAL.test(l.url + " " + l.label)) rows.push(...link("official-web", l.url, web?.source_url, web?.checked_at));
  for (const r of p.enrichment?.resources ?? [])
    if (INTERNATIONAL.test(r.url + " " + r.label)) rows.push(...link("reviewed-resource", r.url, r.url, r.checked_at));
  // Official pages we already cite for other facts also count when they are the
  // international-applicant page.
  const cited = [
    ...(p.enrichment?.admissions ?? []).map((f) => [f.source_url, f.checked_at] as const),
    ...(p.requirements ?? []).map((r) => [urlOf(r), r.verified_at] as const),
    ...(p.costs ?? []).map((c) => [urlOf(c), c.verified_at] as const),
  ];
  for (const [u, checked] of cited) if (u && INTERNATIONAL.test(hostAndPath(u))) rows.push(...link("cited-source", u, u, checked));
  return rows;
}

function websiteEvidence(p: ProfileInput): Evidence[] {
  return link("identity", p.website, p.reference_url, p.reference_retrieved_at);
}

const COLLECTORS: Record<FieldKey, (p: ProfileInput) => Evidence[]> = {
  tuition: tuitionEvidence,
  living_cost: livingEvidence,
  requirements: requirementsEvidence,
  english_minimum: englishEvidence,
  deadline: deadlineEvidence,
  application_fee: feeEvidence,
  scholarships: scholarshipEvidence,
  admissions_link: admissionsLinkEvidence,
  international_link: internationalLinkEvidence,
  website: websiteEvidence,
};

const daysBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

/** Is this one piece of evidence current for its field? */
export function isCurrent(field: FieldKey, e: Evidence, ctx: Context): boolean {
  if (!isUrl(e.url)) return false;
  if (LINK_FIELDS.includes(field)) return !!e.checked && daysBetween(e.checked, ctx.today) <= LINK_FRESH_DAYS;
  if (e.year.start == null) return false;
  return (CYCLE_FIELDS.includes(field) ? CURRENT_CYCLE_STARTS : CURRENT_ACADEMIC_STARTS).includes(e.year.start);
}

/** Tuition only satisfies the report when currency AND year are both stated. */
export const tuitionComplete = (e: Evidence) => isUrl(e.url) && !!e.currency && e.year.start != null;

export function classifyEvidence(field: FieldKey, evidence: Evidence[], ctx: Context): Verdict {
  const sourced = evidence.filter((e) => isUrl(e.url));
  const current = sourced.filter((e) => isCurrent(field, e, ctx));
  // Report the best record: current, then sourced with the latest year, then anything.
  const byYear = [...sourced].sort((a, b) => (b.year.start ?? -1) - (a.year.start ?? -1));
  const best = current[0] ?? byYear[0] ?? evidence[0];
  return {
    present: evidence.length > 0,
    sourced: sourced.length > 0,
    current: current.length > 0,
    year: best ? best.year.label : "—",
    detail: best ? `${best.origin}: ${best.detail}` : "",
    evidence,
  };
}

export function classifyProfile(p: ProfileInput, ctx: Context): Record<FieldKey, Verdict> {
  return Object.fromEntries(FIELDS.map((f) => [f, classifyEvidence(f, COLLECTORS[f](p), ctx)])) as Record<FieldKey, Verdict>;
}

// ---- report-readiness ----------------------------------------------------

export const REPORT_READY_PARTS = ["tuition", "english_minimum", "deadline", "admissions_link"] as const;
export type ReadyPart = (typeof REPORT_READY_PARTS)[number];

/** Report-ready = sourced tuition with currency and year, a sourced English
 * minimum, a sourced deadline and a sourced official admissions link. Returns
 * the missing parts with a short reason; empty means report-ready. */
export function missingForReport(v: Record<FieldKey, Verdict>): { part: ReadyPart; why: string }[] {
  const out: { part: ReadyPart; why: string }[] = [];
  const t = v.tuition;
  if (!t.evidence.some(tuitionComplete))
    out.push({
      part: "tuition",
      why: !t.present ? "no tuition stored" : !t.sourced ? "tuition has no source" : "tuition lacks a stated currency or year",
    });
  for (const part of ["english_minimum", "deadline", "admissions_link"] as const)
    if (!v[part].sourced) out.push({ part, why: v[part].present ? "stored but unsourced" : "not stored" });
  return out;
}

/** Same as report-ready, but each of the four parts must also be current. */
export function reportReadyCurrent(v: Record<FieldKey, Verdict>, ctx: Context): boolean {
  return (
    v.tuition.evidence.some((e) => tuitionComplete(e) && isCurrent("tuition", e, ctx)) &&
    v.english_minimum.current &&
    v.deadline.current &&
    v.admissions_link.current
  );
}

/** Official pages we already store where a person could look a missing field up.
 * Only stored URLs are returned; nothing is constructed. */
export function lookupPage(p: ProfileInput, field: FieldKey): string | null {
  const web = p.official_web?.links ?? {};
  const res = (kind: string) => p.enrichment?.resources.find((r) => r.kind === kind)?.url;
  const admissions = web.admissions?.url || p.admissions_url || res("admissions");
  const options: Record<FieldKey, (string | null | undefined)[]> = {
    tuition: [res("costs"), web.fees?.url, web.funding?.url, p.net_price_url, p.scorecard?.net_price_calculator, p.financial_aid_url, admissions],
    living_cost: [res("costs"), web.fees?.url, p.net_price_url, p.scorecard?.net_price_calculator, p.financial_aid_url],
    requirements: [web.requirements?.url, p.application_brief?.requirements_source, admissions],
    english_minimum: [web.requirements?.url, p.application_brief?.requirements_source, admissions],
    deadline: [p.application_url, p.application_brief?.requirements_source, admissions],
    application_fee: [p.application_url, admissions],
    scholarships: [web.scholarships?.url, p.financial_aid_url],
    admissions_link: [p.website],
    international_link: [admissions, p.website],
    website: [],
  };
  return options[field].find(isUrl) ?? null;
}
