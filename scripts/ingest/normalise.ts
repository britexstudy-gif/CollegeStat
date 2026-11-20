// Pure normalisers for the v2 ingest: messy research values → schema values.
// Each one is conservative: when a value cannot be read with confidence it
// returns null and the raw text is kept (due_text, note, platform_note…).
import type { DeadlineRound, Platform, RequirementKind } from "../../server/data-v2/schema";
import { num, str } from "./lib";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MONTH_RE = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const monthIndex = (m: string) => MONTHS.findIndex((name) => name.startsWith(m.toLowerCase().replace(/\.$/, "").slice(0, 3)));
const pad = (n: number) => String(n).padStart(2, "0");
const validDay = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

/** `Fall 2027 entry`, `2027/28`, `2027-28 cycle` → 2027 (the entry year). */
export function intakeYearOf(text: unknown, fallback: number): number {
  const s = str(text);
  if (!s) return fallback;
  const m = /\b(20[2-3]\d)\s*[/-]\s*(\d{2,4})\b/.exec(s) ?? /\b(20[2-3]\d)\b/.exec(s);
  return m ? Number(m[1]) : fallback;
}

export interface ParsedDate {
  date: string;
  inferred: boolean;
}
/** Every date mentioned in a text. Month–day without a year is placed in the
 * application cycle for `intakeYear` (Aug–Dec → year before entry) and flagged inferred. */
export function datesIn(text: string, intakeYear: number): ParsedDate[] {
  const found: { at: number; d: ParsedDate }[] = [];
  const push = (at: number, y: number, m: number, d: number, inferred: boolean) => {
    if (m >= 1 && validDay(y, m, d)) found.push({ at, d: { date: `${y}-${pad(m)}-${pad(d)}`, inferred } });
  };
  const taken: [number, number][] = [];
  const free = (i: number, len: number) => !taken.some(([a, b]) => i < b && i + len > a);
  const scan = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    for (const m of text.matchAll(re)) {
      if (!free(m.index!, m[0].length)) continue;
      taken.push([m.index!, m.index! + m[0].length]);
      fn(m as RegExpExecArray);
    }
  };
  scan(/\b(20\d{2})-(\d{2})-(\d{2})\b/g, (m) => push(m.index!, +m[1], +m[2], +m[3], false));
  scan(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE},?\\s+(20\\d{2})\\b`, "gi"), (m) =>
    push(m.index!, +m[3], monthIndex(m[2]) + 1, +m[1], false));
  scan(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d{2})\\b`, "gi"), (m) =>
    push(m.index!, +m[3], monthIndex(m[1]) + 1, +m[2], false));
  const cycle = (month: number) => (month >= 8 ? intakeYear - 1 : intakeYear);
  scan(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH_RE}(?![\\w])`, "gi"), (m) => {
    const month = monthIndex(m[2]) + 1;
    push(m.index!, cycle(month), month, +m[1], true);
  });
  scan(new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?!\\s*,?\\s*20\\d{2})`, "gi"), (m) => {
    const month = monthIndex(m[1]) + 1;
    push(m.index!, cycle(month), month, +m[2], true);
  });
  return found.sort((a, b) => a.at - b.at).map((f) => f.d);
}

/** Round code from a label like "Restrictive Early Action" or "UCAS equal-consideration". */
export function roundOf(label: string): DeadlineRound {
  const s = label.toLowerCase().replace(/[_-]+/g, " ");
  if (/restrictive early action|single choice early action|\brea\b|\bscea\b/.test(s)) return "restrictive_early_action";
  if (/early decision (ii|2)|\bed ?(ii|2)\b/.test(s)) return "early_decision_2";
  if (/early decision|\bed ?(i|1)?\b/.test(s)) return "early_decision";
  if (/early action|\bea\b/.test(s)) return "early_action";
  if (/scholarship|bursary|funding/.test(s)) return "scholarship";
  if (/priority/.test(s)) return "priority";
  if (/rolling/.test(s)) return "rolling";
  if (/(first|1st) round|round (1|one)|first deadline|advance/.test(s)) return "first_round";
  if (/(second|2nd) round|round (2|two)|second deadline/.test(s)) return "second_round";
  if (/(third|3rd) round|round (3|three)/.test(s)) return "third_round";
  if (/document|diploma|transcript|visa/.test(s)) return "document";
  if (/\bopens?\b|opening|start/.test(s)) return "open";
  if (/regular|ucas|equal consideration|main|standard|undergraduate application|first year|fall|autumn/.test(s)) return "regular";
  if (/\bclos(e|es|ing)\b|final|last/.test(s)) return "close";
  return "other";
}

export interface DeadlineCandidate {
  round: DeadlineRound;
  round_label: string;
  due_date: string | null;
  due_date_inferred: boolean;
  due_text: string | null;
  intake_year: number;
}

const META_KEYS = new Set(["cycle", "cycle_year", "entry_term", "note", "notes", "single_application_period", "dates"]);
const humanise = (key: string) => key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Rows from a research `deadlines.value`: an array of {round,date,cycle}, an object of
 * named rounds, or free text. Dates from an earlier cycle are dropped (kept as text). */
export function deadlinesFromValue(value: unknown, defaultIntake: number): DeadlineCandidate[] {
  const out: DeadlineCandidate[] = [];
  const add = (label: string, text: string | null, cycleText: unknown, fallbackLabel = label) => {
    const intake = intakeYearOf(cycleText, defaultIntake);
    const dates = text ? datesIn(text, intake) : [];
    const one = dates.length === 1 ? dates[0] : null;
    const stale = one && one.date < `${intake - 1}-01-01`;
    const round_label = (label || fallbackLabel).slice(0, 200);
    if (!one && !text) return;
    out.push({
      round: roundOf(round_label),
      round_label,
      due_date: one && !stale ? one.date : null,
      due_date_inferred: !!(one && !stale && one.inferred),
      due_text: one && !stale && text && /^\s*[\w\s,.-]{0,30}\s*$/.test(text) ? null : text,
      intake_year: intake,
    });
  };
  if (Array.isArray(value)) {
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      const label = str(r.round) ?? str(r.label) ?? str(r.name) ?? "Application deadline";
      add(label, str(r.date) ?? str(r.due) ?? str(r.deadline), r.cycle ?? r.cycle_year);
    }
  } else if (typeof value === "string") {
    const dates = datesIn(value, defaultIntake);
    add(dates.length === 1 ? labelFromText(value) : "Application window", value, value);
  } else if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    const cycle = o.cycle ?? o.cycle_year ?? o.entry_term;
    for (const [key, v] of Object.entries(o)) {
      if (META_KEYS.has(key) || v == null) continue;
      if (/^latest_/.test(key)) {
        const text = typeof v === "string" ? v : JSON.stringify(v);
        add("Latest published cycle", text, text);
        continue;
      }
      if (typeof v === "string" || typeof v === "number") add(humanise(key), String(v), cycle);
      else if (typeof v === "object") add(humanise(key), JSON.stringify(v), cycle);
    }
  }
  return out;
}
const labelFromText = (text: string) => {
  const r = roundOf(text);
  return r === "other" ? "Application deadline" : humanise(r);
};

// ── Money ──

/** ISO currency + billing period from strings like "HKD/year for non-local students" or "AED per credit hour". */
export function currencyOf(raw: unknown): { code: string | null; period: "year" | "semester" | "credit" | "month" | null } {
  const s = str(raw);
  if (!s) return { code: null, period: null };
  const code = /\b([A-Z]{3})\b/.exec(s)?.[1] ?? null;
  const lower = s.toLowerCase();
  const period = /credit/.test(lower) ? "credit" : /semester/.test(lower) ? "semester" : /month/.test(lower) ? "month" : /year|annual/.test(lower) ? "year" : null;
  return { code, period };
}

/** "2026/27", "2026-27", "2026/2027", 2026 → "2026/27". */
export function academicYearOf(raw: unknown): string | null {
  if (typeof raw === "number" && raw >= 2000 && raw <= 2035) return `${raw}/${String((raw + 1) % 100).padStart(2, "0")}`;
  const s = str(raw);
  if (!s) return null;
  const m = /\b(20[0-3]\d)\s*[/-]\s*(?:20)?(\d{2})\b/.exec(s);
  if (m && (Number(m[1]) + 1) % 100 === Number(m[2])) return `${m[1]}/${m[2]}`;
  const y = /\b(20[0-3]\d)\b/.exec(s);
  return y ? academicYearOf(Number(y[1])) : null;
}

// ── Application platform, tests ──

export function platformOf(text: unknown): Platform | null {
  const s = str(text)?.toLowerCase();
  if (!s) return null;
  if (/common app/.test(s)) return "common_app";
  if (/\bucas\b/.test(s)) return "ucas";
  if (/coalition|scoir/.test(s)) return "coalition";
  if (/uni-?assist/.test(s)) return "uni_assist";
  if (/studielink/.test(s)) return "studielink";
  if (/universitaly/.test(s)) return "universitaly";
  if (/\bdirect\b/.test(s)) return "direct";
  if (/parcoursup|campus france|\bnational\b|government portal|ministry|e-?gov|centrali[sz]ed|\bjupas\b|\bouac\b|\buac\b/.test(s)) return "national_portal";
  if (/online|portal|application system|admissions? (office|process|system|website)|international (office|student|admission)|apply\.|website|through the university/.test(s)) return "direct";
  return "other";
}

export type TestStatus = "required" | "optional" | "not_required" | "conditional" | "unknown";

export function statusOf(text: string): TestStatus {
  const s = text.toLowerCase();
  if (/only if|unless|if english|if not|exempt|waiv|conditional|depending/.test(s)) return "conditional";
  if (/not required.*optional|optional|may (submit|self-report)|recommended/.test(s)) return "optional";
  if (/not (required|accepted|considered|used)|test-blind|no english/.test(s)) return "not_required";
  if (/required|minimum|must|overall|at least|\d/.test(s)) return "required";
  return "unknown";
}

export function satActPolicyOf(text: unknown): "required" | "optional" | "not_considered" | "recommended" | "unknown" {
  const s = str(text)?.toLowerCase();
  if (!s) return "unknown";
  if (/test[- ]blind|not considered|not used|will not consider|does not consider/.test(s)) return "not_considered";
  if (/test[- ]optional|optional|not required/.test(s)) return "optional";
  if (/recommended/.test(s)) return "recommended";
  if (/required/.test(s)) return "required";
  return "unknown";
}

const RANGES: Record<"IELTS" | "TOEFL" | "DUOLINGO", [number, number]> = { IELTS: [4, 9], TOEFL: [30, 120], DUOLINGO: [60, 160] };

export interface EnglishRequirement {
  kind: "IELTS" | "TOEFL" | "DUOLINGO";
  status: TestStatus;
  minimum: number | null;
  component_minimum: number | null;
  note: string | null;
}
/** One English test value as research files store it: number, text or {overall_minimum, band_minimum}. */
export function englishOf(kind: "IELTS" | "TOEFL" | "DUOLINGO", value: unknown): EnglishRequirement | null {
  if (value == null) return null;
  const [lo, hi] = RANGES[kind];
  const inRange = (n: number | null) => (n != null && n >= lo && n <= hi ? n : null);
  if (typeof value === "number") {
    const m = inRange(value);
    return m == null ? null : { kind, status: "required", minimum: m, component_minimum: null, note: null };
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const minimum = inRange(num(o.overall_minimum ?? o.minimum ?? o.overall ?? o.score));
    const component = num(o.band_minimum ?? o.component_minimum ?? o.section_minimum);
    const note = str(o.note) ?? str(o.scale_note);
    if (minimum == null && !note) return null;
    return { kind, status: minimum != null ? "required" : "unknown", minimum, component_minimum: component, note };
  }
  const text = str(value);
  if (!text) return null;
  const status = statusOf(text);
  let minimum: number | null = null;
  if (status !== "not_required" && status !== "optional") {
    const pattern = kind === "IELTS" ? /\b([4-9](?:\.[05])?)\b/ : /\b(\d{2,3})\b/;
    minimum = inRange(num(pattern.exec(text)?.[1]));
  }
  return { kind, status: minimum != null && status === "unknown" ? "required" : status, minimum, component_minimum: null, note: text };
}

/** Kind for a published requirement row (`kind` + `label`). */
export function requirementKindOf(kind: unknown, label: unknown): RequirementKind {
  const k = `${str(kind) ?? ""} ${str(label) ?? ""}`.toUpperCase();
  if (/IELTS/.test(k)) return "IELTS";
  if (/TOEFL/.test(k)) return "TOEFL";
  if (/DUOLINGO|\bDET\b/.test(k)) return "DUOLINGO";
  if (/\bPTE\b/.test(k)) return "PTE";
  if (/CAMBRIDGE|C1 ADVANCED|C2 PROFICIENCY/.test(k)) return "CAMBRIDGE";
  if (/\bSAT\b/.test(k)) return "SAT";
  if (/\bACT\b/.test(k)) return "ACT";
  if (/A[- ]LEVEL/.test(k)) return "A_LEVEL";
  if (/\bIB\b|BACCALAUREATE/.test(k)) return "IB";
  if (/\bAP\b|ADVANCED PLACEMENT/.test(k)) return "AP";
  if (/RECOMMEND|REFERENCE/.test(k)) return "RECOMMENDATION";
  if (/TRANSCRIPT|SCHOOL REPORT/.test(k)) return "TRANSCRIPT";
  if (/ESSAY|PERSONAL STATEMENT/.test(k)) return "ESSAY";
  if (/PORTFOLIO/.test(k)) return "PORTFOLIO";
  if (/INTERVIEW/.test(k)) return "INTERVIEW";
  if (/ENTRANCE|ADMISSION TEST|EXAM/.test(k)) return "ENTRANCE_EXAM";
  return "OTHER";
}

export function degreeLevelOf(raw: unknown): "Foundation" | "Bachelor" | "Master" | "Doctorate" | "Diploma" | "Other" {
  const s = (str(raw) ?? "").toLowerCase();
  if (/foundation/.test(s)) return "Foundation";
  if (/doctor|phd|dphil/.test(s)) return "Doctorate";
  if (/master|\bm\.?sc\b|\bma\b|\bmba\b|\bmeng\b/.test(s)) return "Master";
  if (/diploma|certificate|associate/.test(s)) return "Diploma";
  if (/bachelor|\bb\.?sc\b|\bba\b|\bbeng\b|\bbs\b|\bbba\b|undergrad|laurea\b|licen/.test(s) || !s) return "Bachelor";
  return "Other";
}

const SYMBOLS: Record<string, string> = { "€": "EUR", "£": "GBP", "$": "USD", "¥": "JPY", "₩": "KRW", "₸": "KZT" };

/** Reads a tuition sentence ("KRW 2,029,000 per semester", "USD 6,400–12,592 per year",
 * "No tuition fees currently charged"). Null when the text does not state one figure. */
export function tuitionFromText(raw: unknown): { amount: number | null; range_min: number | null; range_max: number | null; currency: string; period: "year" | "semester" | "credit" | "month" } | null {
  const text = str(raw);
  if (!text) return null;
  const lower = text.toLowerCase();
  if (/\bno tuition|tuition[- ]free|free of (charge|tuition)|no tuition fees?\b/.test(lower) && !/not (listed|established|verified|found)/.test(lower))
    return { amount: 0, range_min: null, range_max: null, currency: SYMBOLS[/[€£$]/.exec(text)?.[0] ?? "€"] ?? "EUR", period: "year" };
  if (/not (listed|established|verified|found|stated)|no international .* verified/.test(lower)) return null;
  const money = /(?:\b([A-Z]{3})\s?|([€£$¥₩₸])\s?)(\d{1,3}(?:[ ,]\d{3})+|\d+)(?:\.\d+)?(?:\s?[–-]\s?(?:[A-Z]{3}\s?|[€£$¥₩₸]\s?)?(\d{1,3}(?:[ ,]\d{3})+|\d+))?/.exec(text);
  if (!money) return null;
  const currency = money[1] ?? SYMBOLS[money[2]];
  if (!currency) return null;
  const first = Number(money[3].replace(/[ ,]/g, ""));
  const second = money[4] ? Number(money[4].replace(/[ ,]/g, "")) : null;
  const after = lower.slice(money.index + money[0].length, money.index + money[0].length + 40);
  const period = /semester|term/.test(after) || /per[- ]semester|semester (fee|tuition)/.test(lower) ? "semester" : /credit/.test(after) ? "credit" : /month/.test(after) ? "month" : "year";
  return second ? { amount: null, range_min: first, range_max: second, currency, period } : { amount: first, range_min: null, range_max: null, currency, period };
}
