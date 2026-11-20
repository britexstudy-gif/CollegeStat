/** Welcome questions: option lists, the answer shape and how answers map to
 * and from `profiles.preferences` (jsonb). Pure, so tests can import it. */
import type { IntakePreferences, StudentIntake } from "@/lib/student-intake";
import { INTEREST_QUESTIONS, normalizeSubjects, programmeTerm, type Interests } from "@/lib/programmes";
import { GRADE_SCALES, examFor, examValid, normalizeGrade, type GradeScale, type Normalized } from "@/lib/grades/convert";

export { GRADE_SCALES, type GradeScale };

export const HOME_FIRST = ["UZ", "KZ", "KG", "TJ", "TM"] as const;
/** Other home countries in the select, after the five above. */
export const HOME_OTHER = ["AF", "AZ", "AM", "GE", "MN", "RU", "TR", "CN", "IN", "PK", "IR", "UA", "BY"] as const;
export const CITY_SUGGESTIONS: Record<string, string[]> = {
  UZ: ["Tashkent", "Samarkand", "Bukhara", "Namangan", "Andijan", "Fergana", "Nukus"],
  KZ: ["Almaty", "Astana", "Shymkent", "Karaganda", "Aktobe"],
  KG: ["Bishkek", "Osh", "Jalal-Abad"],
  TJ: ["Dushanbe", "Khujand", "Bokhtar"],
  TM: ["Ashgabat", "Turkmenabat", "Mary"],
};

export const SCHOOL_TYPES = ["state", "specialised", "presidential", "international", "other"] as const;
export const CERTIFICATES = ["attestat", "ib", "alevel", "ap", "other"] as const;
/** Existing `intake.curriculum` labels, so older dashboard code keeps reading it. */
const CERTIFICATE_CURRICULUM: Record<Certificate, string> = {
  attestat: "National diploma",
  ib: "IB Diploma",
  alevel: "A-levels",
  ap: "AP / US high school",
  other: "Other",
};

export const DEFAULT_SCALE: Record<Certificate, GradeScale> = {
  attestat: "five",
  ib: "ib",
  alevel: "alevel",
  ap: "gpa",
  other: "hundred",
};
/** Current school year ("done" = already finished school). */
export const SCHOOL_CLASSES = ["9", "10", "11", "12", "done"] as const;

/** The 15 subjects older profiles stored (kept for older imports); the picker now uses lib/programmes.ts. */
export const SUBJECTS = [
  "Computer Science",
  "Data Science",
  "Engineering",
  "Mathematics",
  "Physics",
  "Business",
  "Economics",
  "Finance",
  "Medicine",
  "Biology",
  "Law",
  "International Relations",
  "Psychology",
  "Architecture",
  "Design",
] as const;

export const DESTINATIONS = [
  "US", "GB", "DE", "KR", "CA", "IT", "TR", "MY", "NL", "JP",
  "CN", "HU", "CZ", "PL", "FR", "AU", "SG", "HK", "AE", "ES",
] as const;
export const PRIORITIES = ["cost", "ranking", "scholarships", "language", "safety", "proximity"] as const;

/** Yearly budget bands in USD (tuition + living). 90000 = no limit. Older answers used 5k/10k/25k/50k/90k, all still here. */
export const BUDGETS = [
  { id: "5", value: 5000 },
  { id: "10", value: 10000 },
  { id: "15", value: 15000 },
  { id: "25", value: 25000 },
  { id: "35", value: 35000 },
  { id: "50", value: 50000 },
  { id: "50plus", value: 90000 },
] as const;
export const FUNDING = ["family", "partial", "full"] as const;

export const ENGLISH_STATUS = ["taken", "planned", "none", "native"] as const;
export const ENGLISH_TESTS = [
  { id: "ielts", label: "IELTS", min: 0, max: 9, step: 0.5 },
  { id: "toefl", label: "TOEFL iBT", min: 0, max: 120, step: 1 },
  { id: "duolingo", label: "Duolingo", min: 10, max: 160, step: 5 },
] as const;
export const SAT_STATUS = ["taken", "planned", "no", "unsure"] as const;
export const SAT_TESTS = [
  { id: "sat", label: "SAT", min: 400, max: 1600 },
  { id: "act", label: "ACT", min: 1, max: 36 },
] as const;

/** Legacy activity tags, still written for older dashboard code; derived from the lists below. */
export const ACTIVITIES = [
  "olympiad_national",
  "olympiad_international",
  "research",
  "coding",
  "volunteering",
  "debate",
  "leadership",
  "sport",
  "arts",
  "work",
  "startup",
] as const;
/** Common App–style activity types (a shorter list). */
export const ACTIVITY_TYPES = [
  "academic",
  "research",
  "coding",
  "volunteering",
  "debate",
  "leadership",
  "sport",
  "arts",
  "work",
  "startup",
  "family",
  "other",
] as const;
export const HONOUR_LEVELS = ["school", "region", "national", "international"] as const;
export const MEDALS = ["gold", "silver", "bronze", "honourable", "participant"] as const;

/* ── Deeper questions (Nov 16). All optional, all kept in preferences.intake.details. ── */
export const CLASS_RANKS = ["top1", "top5", "top10", "top25", "top50", "other", "none"] as const;
export const SCHOOL_SUBJECTS = ["maths", "physics", "chemistry", "biology", "it", "english", "literature", "history", "economics", "languages", "geography", "arts"] as const;
export const RESEARCH_LEVELS = ["none", "project", "research", "published"] as const;
export const EXAM_STATUS = ["taken", "planned", "none"] as const;
/** The tests every student is asked about, one row each (others are optional chips). */
export const CORE_TESTS = ["ielts", "toefl", "duolingo", "sat", "act"] as const;
export const DEPTH_AREAS = ["leadership", "volunteering", "work", "sport", "arts"] as const;
export const DEPTH_YEARS = ["0", "1", "2", "3"] as const; // none, under 1 year, 1–2 years, 3+ years
export const DEPTH_HOURS = ["low", "mid", "high"] as const; // 1–3, 4–7, 8+ hours a week
export const CAREERS = ["tech", "business", "finance", "research", "health", "public", "creative", "engineering", "unsure"] as const;
export const YES_MAYBE_NO = ["yes", "maybe", "no"] as const;
export const WORK_AFTER = ["must", "nice", "no"] as const;
export const STUDY_LANGS = ["english", "german", "korean", "turkish", "russian", "chinese", "japanese", "french", "italian", "hungarian", "polish", "czech"] as const;
export const CITY_SIZES = ["big", "mid", "small", "any"] as const;
export const CLIMATES = ["warm", "mild", "cold", "any"] as const;
export const SETTINGS = ["campus", "city", "any"] as const;
export const IMPORTANCE = ["high", "medium", "low"] as const;
export const DISTANCES = ["near", "medium", "any"] as const;
export const INTAKE_TERMS = ["fall", "spring"] as const;
export const APP_HOURS = ["lt3", "3to6", "7to10", "10plus"] as const;
export const HELPERS = ["alone", "parents", "counsellor", "teacher", "agent", "friends"] as const;

export type DepthEntry = { years: (typeof DEPTH_YEARS)[number]; hours?: (typeof DEPTH_HOURS)[number] };
export type ActivityDepth = Partial<Record<(typeof DEPTH_AREAS)[number], DepthEntry>>;
export const MAX_ACTIVITIES = 10;
export const MAX_HONOURS = 5;

/** Certificates and tests, each with its own score format. */
export const CERT_TESTS = [
  { id: "ielts", label: "IELTS", kind: "number", min: 0, max: 9, example: "7.0" },
  { id: "toefl", label: "TOEFL iBT", kind: "number", min: 0, max: 120, example: "100" },
  { id: "duolingo", label: "Duolingo", kind: "number", min: 10, max: 160, example: "125" },
  { id: "sat", label: "SAT", kind: "number", min: 400, max: 1600, example: "1450" },
  { id: "act", label: "ACT", kind: "number", min: 1, max: 36, example: "32" },
  { id: "ap", label: "AP", kind: "text", pattern: /^[1-5](\s*[,;\s]\s*[1-5])*$/, example: "5, 4, 5" },
  { id: "ib_predicted", label: "IB predicted", kind: "number", min: 0, max: 45, example: "38" },
  { id: "alevel_predicted", label: "A-level predicted", kind: "text", pattern: /^(A\*|[A-EU])(\s*,?\s*(A\*|[A-EU]))*$/i, example: "A*AA" },
  { id: "topik", label: "TOPIK", kind: "number", min: 1, max: 6, example: "4" },
  { id: "jlpt", label: "JLPT", kind: "text", pattern: /^N?[1-5]$/i, example: "N2" },
  { id: "hsk", label: "HSK", kind: "number", min: 1, max: 9, example: "5" },
  { id: "german", label: "Goethe / TestDaF", kind: "text", pattern: /^([ABC][12]|TDN\s?[345])$/i, example: "B2" },
  { id: "delf", label: "DELF / DALF", kind: "text", pattern: /^[ABC][12]$/i, example: "B2" },
] as const;
export type CertId = (typeof CERT_TESTS)[number]["id"];
export const TEST_STATUS = ["taken", "planned"] as const;
export const certTest = (id?: string) => CERT_TESTS.find((t) => t.id === id);

export type TestEntry = { id: CertId; status: (typeof TEST_STATUS)[number]; score: string; date: string };
export type ActivityEntry = {
  type: (typeof ACTIVITY_TYPES)[number];
  role: string;
  org: string;
  hours: string;
  weeks: string;
  grades: string[];
  description: string;
};
export type HonourEntry = { title: string; level: (typeof HONOUR_LEVELS)[number]; grade: string; medal?: (typeof MEDALS)[number] };

export const LANGUAGES_SPOKEN = ["uz", "kk", "ky", "tg", "tk", "ru", "en", "tr", "de", "fr", "ko", "zh", "ar", "fa"] as const;
export const APPLY_COUNTS = ["1-3", "4-7", "8-12", "13+"] as const;
export const SUPPORT = ["shortlist", "essays", "tests", "scholarships", "visas", "documents", "interviews"] as const;

export type Certificate = (typeof CERTIFICATES)[number];
type EnglishTest = (typeof ENGLISH_TESTS)[number]["id"];

export type Answers = {
  name: string;
  home_country?: string;
  home_city: string;
  school_type?: (typeof SCHOOL_TYPES)[number];
  school_name: string;
  school_class?: (typeof SCHOOL_CLASSES)[number];
  certificate?: Certificate;
  graduation_year?: number;
  grade_scale?: GradeScale;
  grade: string;
  /** National entrance exam score (UNT, ORT or NTC by home country). */
  exam_score: string;
  /** Every certificate and test; english_* and sat_* below are derived from it (syncTests). */
  tests: TestEntry[];
  subjects: string[];
  countries: string[];
  priorities: string[];
  budget?: number;
  funding?: (typeof FUNDING)[number];
  english_status?: (typeof ENGLISH_STATUS)[number];
  english_test?: EnglishTest;
  english_score: string;
  english_date: string;
  sat_status?: (typeof SAT_STATUS)[number];
  sat_test?: "sat" | "act";
  sat_score: string;
  sat_date: string;
  /** Legacy tags, derived from activity_list and honours (syncActivities). */
  activities: string[];
  activity_list: ActivityEntry[];
  honours: HonourEntry[];
  languages: string[];
  start_year?: number;
  apply_count?: (typeof APPLY_COUNTS)[number];
  support: string[];
  interface_lang?: string;
} & DeepAnswers;
/** Answers with every deep list filled in (what answersFrom returns). */
export type FullDeep = Required<Pick<DeepAnswers, "strong_subjects" | "exam_date" | "tests_declined" | "activity_depth" | "interests" | "study_langs" | "helpers">>;

/** The deeper questions (all optional). Same names in Answers and IntakeDetails. */
export type DeepAnswers = {
  class_rank?: (typeof CLASS_RANKS)[number];
  strong_subjects?: string[];
  research?: (typeof RESEARCH_LEVELS)[number];
  /** National exam (UNT/ORT/NTC): taken uses exam_score, planned uses exam_score as the target. */
  exam_status?: (typeof EXAM_STATUS)[number];
  exam_date?: string;
  /** Core tests the student said they won't take. */
  tests_declined?: string[];
  activity_depth?: ActivityDepth;
  /** "Help me choose" answers (lib/programmes.ts). */
  interests?: Interests;
  career?: (typeof CAREERS)[number];
  work_after?: (typeof WORK_AFTER)[number];
  return_home?: (typeof YES_MAYBE_NO)[number];
  study_langs?: string[];
  foundation?: (typeof YES_MAYBE_NO)[number];
  city_size?: (typeof CITY_SIZES)[number];
  climate?: (typeof CLIMATES)[number];
  setting?: (typeof SETTINGS)[number];
  safety?: (typeof IMPORTANCE)[number];
  distance?: (typeof DISTANCES)[number];
  halal?: (typeof IMPORTANCE)[number];
  /** 0 = cost matters most, 100 = ranking matters most; undefined = not answered. */
  rank_vs_cost?: number;
  loan?: (typeof YES_MAYBE_NO)[number];
  intake_term?: (typeof INTAKE_TERMS)[number];
  app_hours?: (typeof APP_HOURS)[number];
  helpers?: string[];
};

/** Extra answers kept in `preferences.intake.details` (no schema change). */
export type IntakeDetails = {
  home_country?: string;
  home_city?: string;
  school_type?: Answers["school_type"];
  school_name?: string;
  school_class?: Answers["school_class"];
  certificate?: Certificate;
  grade_scale?: GradeScale;
  grade_value?: string;
  /** Comparable figure for grade_value (lib/grades/convert.ts). */
  grade_norm?: Normalized;
  exam?: { id: string; score: string };
  /** Target score when the national exam is still planned. */
  exam_target?: string;
  tests?: TestEntry[];
  subjects?: string[];
  funding?: Answers["funding"];
  english_status?: Answers["english_status"];
  english_target?: number;
  english_date?: string;
  sat_status?: Answers["sat_status"];
  sat_test?: "sat" | "act";
  sat_score?: number;
  sat_target?: number;
  sat_date?: string;
  activities?: string[];
  /** Kept from the earlier free-text question; shown as one activity. */
  activities_note?: string;
  activity_list?: ActivityEntry[];
  honours?: HonourEntry[];
  languages?: string[];
  apply_count?: Answers["apply_count"];
  support?: string[];
  interface_lang?: string;
} & Partial<DeepAnswers>;

export type OnboardingIntake = StudentIntake & { details?: IntakeDetails };

/** School-leaving years still ahead (before June, this year counts). */
export function graduationYears(now = new Date()) {
  const first = now.getMonth() < 6 ? now.getFullYear() : now.getFullYear() + 1;
  return [first, first + 1, first + 2];
}

/** Months as YYYY-MM from `from` months away (negative = past), `count` of them. */
export function monthRange(now = new Date(), from = 0, count = 18) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() + from + i, 1));
    return d.toISOString().slice(0, 7);
  });
}
/** The next 18 months as YYYY-MM, for planned test dates. */
export const upcomingMonths = (now = new Date(), count = 18) => monthRange(now, 0, count);
/** The last 30 months, newest first, for tests already taken. */
export const pastMonths = (now = new Date()) => monthRange(now, -29, 30).reverse();

export const numberIn = (raw: string, min: number, max: number) => {
  const n = Number(raw);
  return raw.trim() && Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};

export const englishTest = (id?: string) => ENGLISH_TESTS.find((t) => t.id === id);
export const satTest = (id?: string) => SAT_TESTS.find((t) => t.id === id);

/** A test score in that test's own format, or undefined when it doesn't fit. */
export function testScore(id: CertId, raw: string): string | undefined {
  const t = certTest(id);
  const v = raw.trim().slice(0, 16);
  if (!t || !v) return undefined;
  if (t.kind === "number") return numberIn(v, t.min, t.max) !== undefined ? String(Number(v)) : undefined;
  return t.pattern.test(v) ? v.toUpperCase() : undefined;
}

const pickList = <T extends string>(value: unknown, allowed: readonly T[], max: number) =>
  Array.isArray(value) ? (value.filter((v) => (allowed as readonly unknown[]).includes(v)) as T[]).slice(0, max) : [];
const oneOf = <T extends string>(value: unknown, allowed: readonly T[]) =>
  (allowed as readonly unknown[]).includes(value) ? (value as T) : undefined;
const month = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}$/.test(v) ? v : "");
const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const record = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function readTests(value: unknown): TestEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value
    .map(record)
    .map((x) => ({
      id: oneOf(x.id, CERT_TESTS.map((t) => t.id)),
      status: oneOf(x.status, TEST_STATUS) ?? "planned",
      score: text(x.score, 16),
      date: month(x.date),
    }))
    .filter((x): x is TestEntry => !!x.id && !seen.has(x.id) && !!seen.add(x.id))
    .slice(0, CERT_TESTS.length);
}
const digits = (v: unknown, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? String(Math.min(max, Math.round(n))) : "";
};
function readActivities(value: unknown): ActivityEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(record)
    .map((x) => ({
      type: oneOf(x.type, ACTIVITY_TYPES) ?? "other",
      role: text(x.role, 50),
      org: text(x.org, 100),
      hours: digits(x.hours, 80),
      weeks: digits(x.weeks, 52),
      grades: pickList(x.grades, SCHOOL_CLASSES, 5),
      description: text(x.description, 150),
    }))
    .slice(0, MAX_ACTIVITIES);
}
function readHonours(value: unknown): HonourEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(record)
    .map((x) => {
      const medal = oneOf(x.medal, MEDALS);
      return { title: text(x.title, 100), level: oneOf(x.level, HONOUR_LEVELS) ?? "school", grade: oneOf(x.grade, SCHOOL_CLASSES) ?? "", ...(medal ? { medal } : {}) };
    })
    .slice(0, MAX_HONOURS);
}

function readDepth(value: unknown): ActivityDepth {
  const out: ActivityDepth = {};
  const r = record(value);
  for (const area of DEPTH_AREAS) {
    const x = record(r[area]);
    const years = oneOf(x.years, DEPTH_YEARS);
    if (!years) continue;
    const hours = years === "0" ? undefined : oneOf(x.hours, DEPTH_HOURS);
    out[area] = hours ? { years, hours } : { years };
  }
  return out;
}

function readInterests(value: unknown): Interests {
  const r = record(value);
  const out: Interests = {};
  for (const q of Object.keys(INTEREST_QUESTIONS) as (keyof typeof INTEREST_QUESTIONS)[]) {
    const v = oneOf(r[q], INTEREST_QUESTIONS[q] as readonly string[]);
    if (v) (out as Record<string, string>)[q] = v;
  }
  return out;
}

/** The deeper answers from saved details (missing = not answered). */
export function readDeep(d: Partial<DeepAnswers> | undefined): DeepAnswers & FullDeep {
  const x = (d || {}) as Record<string, unknown>;
  const slider = Number(x.rank_vs_cost);
  return {
    class_rank: oneOf(x.class_rank, CLASS_RANKS),
    strong_subjects: pickList(x.strong_subjects, SCHOOL_SUBJECTS, 3),
    research: oneOf(x.research, RESEARCH_LEVELS),
    exam_status: oneOf(x.exam_status, EXAM_STATUS),
    exam_date: month(x.exam_date),
    tests_declined: pickList(x.tests_declined, CORE_TESTS, CORE_TESTS.length),
    activity_depth: readDepth(x.activity_depth),
    interests: readInterests(x.interests),
    career: oneOf(x.career, CAREERS),
    work_after: oneOf(x.work_after, WORK_AFTER),
    return_home: oneOf(x.return_home, YES_MAYBE_NO),
    study_langs: pickList(x.study_langs, STUDY_LANGS, STUDY_LANGS.length),
    foundation: oneOf(x.foundation, YES_MAYBE_NO),
    city_size: oneOf(x.city_size, CITY_SIZES),
    climate: oneOf(x.climate, CLIMATES),
    setting: oneOf(x.setting, SETTINGS),
    safety: oneOf(x.safety, IMPORTANCE),
    distance: oneOf(x.distance, DISTANCES),
    halal: oneOf(x.halal, IMPORTANCE),
    rank_vs_cost: x.rank_vs_cost != null && Number.isFinite(slider) ? Math.max(0, Math.min(100, Math.round(slider))) : undefined,
    loan: oneOf(x.loan, YES_MAYBE_NO),
    intake_term: oneOf(x.intake_term, INTAKE_TERMS),
    app_hours: oneOf(x.app_hours, APP_HOURS),
    helpers: pickList(x.helpers, HELPERS, HELPERS.length),
  };
}

/** Only answered deep fields, cleaned, for saving (no empty strings or lists). */
function writeDeep(a: Answers): Partial<DeepAnswers> {
  const clean = readDeep(a);
  // Depth of an area answered "none" carries no hours; a declined test can't also be in the list.
  clean.tests_declined = clean.tests_declined.filter((id) => !a.tests.some((t) => t.id === id));
  if (clean.exam_status !== "planned") clean.exam_date = "";
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(clean)) {
    if (v == null || v === "") continue;
    if (Array.isArray(v) && !v.length) continue;
    if (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length) continue;
    out[k] = v;
  }
  return out as Partial<DeepAnswers>;
}

/**
 * The older top-3 `priorities` from the deeper answers: the cost/ranking slider,
 * safety, distance, and funding. Falls back to what was saved before.
 */
export function derivePriorities(a: Answers): string[] {
  const out: string[] = [];
  if (a.rank_vs_cost != null) {
    if (a.rank_vs_cost >= 60) out.push("ranking");
    else if (a.rank_vs_cost <= 40) out.push("cost");
  }
  if (a.funding && a.funding !== "family") out.push("scholarships");
  if (a.safety === "high") out.push("safety");
  if (a.distance === "near") out.push("proximity");
  const langs = a.study_langs ?? [];
  if (langs.length && !langs.every((l) => l === "english")) out.push("language");
  const merged = [...new Set([...out, ...a.priorities])].filter((x) => (PRIORITIES as readonly string[]).includes(x));
  return merged.slice(0, 3);
}

/** The nearest budget band at or above a saved figure (older answers used other bands). */
export function budgetBand(value?: number) {
  if (value == null || value <= 0) return value;
  return (BUDGETS.find((b) => b.value >= value) ?? BUDGETS[BUDGETS.length - 1]).value;
}

const ENGLISH_IDS = ["ielts", "toefl", "duolingo"] as const;
/** Prefer a test already taken, then the first planned one. */
const firstOf = (tests: TestEntry[], ids: readonly string[]) =>
  tests.find((t) => ids.includes(t.id) && t.status === "taken") ?? tests.find((t) => ids.includes(t.id));

/** The older single English test and SAT fields, from the test list (the plan still reads them). */
export function syncTests(a: Answers): Answers {
  const english = firstOf(a.tests, ENGLISH_IDS);
  const sat = firstOf(a.tests, ["sat", "act"]);
  const testPicked = (s?: string) => s === "taken" || s === "planned";
  return {
    ...a,
    ...(english
      ? { english_status: english.status, english_test: english.id as EnglishTest, english_score: english.score, english_date: english.date }
      : testPicked(a.english_status)
        ? { english_status: undefined, english_test: undefined, english_score: "", english_date: "" }
        : {}),
    ...(sat
      ? { sat_status: sat.status, sat_test: sat.id as "sat" | "act", sat_score: sat.score, sat_date: sat.date }
      : testPicked(a.sat_status)
        ? { sat_status: undefined, sat_test: undefined, sat_score: "", sat_date: "" }
        : {}),
  };
}

const LEGACY_TAG: Partial<Record<ActivityEntry["type"], (typeof ACTIVITIES)[number]>> = {
  research: "research",
  coding: "coding",
  volunteering: "volunteering",
  debate: "debate",
  leadership: "leadership",
  sport: "sport",
  arts: "arts",
  work: "work",
  startup: "startup",
};
/** Legacy activity tags from the activity and honours lists. */
export function syncActivities(a: Answers): Answers {
  const tags = new Set<string>();
  for (const x of a.activity_list) if (LEGACY_TAG[x.type]) tags.add(LEGACY_TAG[x.type]!);
  for (const h of a.honours) {
    if (h.level === "national") tags.add("olympiad_national");
    if (h.level === "international") tags.add("olympiad_international");
  }
  return { ...a, activities: ACTIVITIES.filter((x) => tags.has(x)) };
}

/** Answers from what the account already has, so returning students edit rather than restart. */
export function answersFrom(prefs: IntakePreferences | undefined, displayName: string | null | undefined): Answers & FullDeep {
  const intake = (prefs?.intake || {}) as OnboardingIntake;
  const d = intake.details || {};
  const certificate =
    oneOf(d.certificate, CERTIFICATES) ??
    (Object.entries(CERTIFICATE_CURRICULUM).find(([, label]) => label === intake.curriculum)?.[0] as Certificate | undefined);
  const english =
    oneOf(d.english_status, ENGLISH_STATUS) ??
    (intake.english_test === "native" ? "native" : intake.english_test === "none" ? "none" : intake.english_score ? "taken" : undefined);
  const test = oneOf(intake.english_test, ENGLISH_IDS);
  const englishValue = english === "taken" ? intake.english_score : english === "planned" ? d.english_target : undefined;
  const satStatus = oneOf(d.sat_status, SAT_STATUS) ?? (intake.sat ? "taken" : undefined);
  const satKind = oneOf(d.sat_test, ["sat", "act"] as const) ?? (intake.sat ? "sat" : undefined);
  const satValue = d.sat_status === "planned" ? d.sat_target : (d.sat_score ?? intake.sat);
  const legacyActivities = pickList(d.activities, ACTIVITIES, ACTIVITIES.length);
  // Before the test list existed, one English test and one SAT/ACT were stored.
  const tests = d.tests
    ? readTests(d.tests)
    : ([
        test && (english === "taken" || english === "planned") && { id: test, status: english, score: englishValue != null ? String(englishValue) : "", date: month(d.english_date) },
        satKind && (satStatus === "taken" || satStatus === "planned") && { id: satKind, status: satStatus, score: satValue != null ? String(satValue) : "", date: month(d.sat_date) },
      ].filter(Boolean) as TestEntry[]);
  const activityList = d.activity_list
    ? readActivities(d.activity_list)
    : [
        ...legacyActivities
          .filter((x) => !x.startsWith("olympiad"))
          .map((x) => ({ type: x as ActivityEntry["type"], role: "", org: "", hours: "", weeks: "", grades: [], description: "" })),
        ...(d.activities_note ? [{ type: "other" as const, role: "", org: "", hours: "", weeks: "", grades: [], description: d.activities_note.slice(0, 150) }] : []),
      ].slice(0, MAX_ACTIVITIES);
  return {
    name: displayName || "",
    home_country: typeof d.home_country === "string" ? d.home_country : undefined,
    home_city: d.home_city || "",
    school_type: oneOf(d.school_type, SCHOOL_TYPES),
    school_name: text(d.school_name, 120),
    school_class: oneOf(d.school_class, SCHOOL_CLASSES),
    certificate,
    graduation_year: intake.graduation_year,
    grade_scale: oneOf(d.grade_scale, Object.keys(GRADE_SCALES) as GradeScale[]) ?? (certificate ? DEFAULT_SCALE[certificate] : undefined),
    grade: d.grade_value || "",
    exam_score: text(record(d.exam).score, 8) || text(d.exam_target, 8),
    tests,
    subjects: normalizeSubjects(d.subjects).length ? normalizeSubjects(d.subjects) : normalizeSubjects(prefs?.field ? [prefs.field] : []),
    countries: (prefs?.countries || []).slice(0, 5),
    priorities: pickList(intake.priorities, PRIORITIES, 3),
    budget: prefs?.budget ?? (prefs?.aid && d.funding === "full" ? 0 : undefined),
    funding: oneOf(d.funding, FUNDING),
    english_status: english,
    english_test: test,
    english_score: englishValue != null ? String(englishValue) : "",
    english_date: month(d.english_date),
    sat_status: satStatus,
    sat_test: satKind,
    sat_score: satValue != null ? String(satValue) : "",
    sat_date: month(d.sat_date),
    activities: legacyActivities,
    activity_list: activityList,
    honours: d.honours
      ? readHonours(d.honours)
      : legacyActivities.filter((x) => x.startsWith("olympiad")).map((x) => ({ title: "", level: x === "olympiad_national" ? "national" : "international", grade: "" })),
    languages: pickList(d.languages, LANGUAGES_SPOKEN, LANGUAGES_SPOKEN.length),
    start_year: intake.start_year,
    apply_count: oneOf(d.apply_count, APPLY_COUNTS),
    support: pickList(d.support, SUPPORT, SUPPORT.length),
    interface_lang: d.interface_lang,
    ...readDeep(d),
  };
}

/** Merge answers into the account's preferences. `complete` marks the intake done. */
export function preferencesFrom(a: Answers, prefs: IntakePreferences, complete: boolean, now = new Date()): IntakePreferences {
  const intake = (prefs.intake || {}) as OnboardingIntake;
  const test = englishTest(a.english_test);
  const englishValue = test ? numberIn(a.english_score, test.min, test.max) : undefined;
  const sat = satTest(a.sat_test);
  const satValue = sat ? numberIn(a.sat_score, sat.min, sat.max) : undefined;
  const scale = a.grade_scale ? GRADE_SCALES[a.grade_scale] : undefined;
  const grade = a.grade.trim().slice(0, 20);
  const norm = a.grade_scale ? normalizeGrade(a.grade_scale, grade) : null;
  const gradeOk = !!norm;
  const exam = examFor(a.home_country);
  const examScore = a.exam_score.trim();
  const finished = !!a.graduation_year && a.graduation_year < graduationYears(now)[0];
  const tests = a.tests.map((t) => ({ ...t, score: testScore(t.id, t.score) ?? "", date: month(t.date) }));
  const details: IntakeDetails = {
    home_country: a.home_country,
    home_city: a.home_city.trim().slice(0, 80) || undefined,
    school_type: a.school_type,
    school_name: a.school_name.trim().slice(0, 120) || undefined,
    school_class: a.school_class,
    certificate: a.certificate,
    grade_scale: gradeOk ? a.grade_scale : undefined,
    grade_value: gradeOk ? grade : undefined,
    grade_norm: norm ?? undefined,
    exam: exam && a.exam_status !== "planned" && examScore && examValid(exam, examScore) ? { id: exam, score: examScore } : undefined,
    exam_target: exam && a.exam_status === "planned" && examScore && examValid(exam, examScore) ? examScore : undefined,
    tests,
    subjects: normalizeSubjects(a.subjects),
    funding: a.funding,
    english_status: a.english_status,
    english_target: a.english_status === "planned" ? englishValue : undefined,
    english_date: ["taken", "planned"].includes(a.english_status || "") ? a.english_date || undefined : undefined,
    sat_status: a.sat_status,
    sat_test: ["taken", "planned"].includes(a.sat_status || "") ? a.sat_test : undefined,
    sat_score: a.sat_status === "taken" ? satValue : undefined,
    sat_target: a.sat_status === "planned" ? satValue : undefined,
    sat_date: ["taken", "planned"].includes(a.sat_status || "") ? a.sat_date || undefined : undefined,
    activities: a.activities,
    activity_list: a.activity_list.slice(0, MAX_ACTIVITIES).map((x) => ({
      ...x,
      role: x.role.trim().slice(0, 50),
      org: x.org.trim().slice(0, 100),
      description: x.description.trim().slice(0, 150),
    })),
    honours: a.honours
      .filter((h) => h.title.trim())
      .slice(0, MAX_HONOURS)
      .map((h) => ({ ...h, title: h.title.trim().slice(0, 100) })),
    languages: a.languages,
    apply_count: a.apply_count,
    support: a.support,
    interface_lang: a.interface_lang,
    ...writeDeep(a),
  };
  const englishForIntake: StudentIntake["english_test"] =
    a.english_status === "native"
      ? "native"
      : a.english_status === "taken" && a.english_test
        ? a.english_test
        : a.english_status === "planned" && a.english_test
          ? a.english_test
          : a.english_status
            ? "none"
            : intake.english_test;
  return {
    ...prefs,
    countries: a.countries.slice(0, 5),
    // The explorer filters by substring, so the first choice is saved as its search word.
    field: a.subjects[0] ? programmeTerm(a.subjects[0]) : prefs.field,
    budget: a.funding === "full" ? undefined : a.budget && a.budget > 0 ? a.budget : undefined,
    currency: "USD",
    aid: a.funding ? a.funding !== "family" : prefs.aid,
    intake: {
      ...intake,
      stage: a.graduation_year ? (finished ? "gap_year" : "high_school") : intake.stage,
      goal_level: "bachelor",
      graduation_year: a.graduation_year,
      start_year: a.start_year,
      curriculum: a.certificate ? CERTIFICATE_CURRICULUM[a.certificate] : intake.curriculum,
      grade: gradeOk ? `${grade}${scale?.max ? "/" + scale.max : ""}` : undefined,
      english_test: englishForIntake,
      english_score: a.english_status === "taken" ? englishValue : undefined,
      sat: a.sat_status === "taken" && a.sat_test === "sat" ? satValue : undefined,
      priorities: derivePriorities(a),
      details,
      ...(complete ? { completed_at: now.toISOString() } : {}),
    } as OnboardingIntake,
  };
}
