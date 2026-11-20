import { admission, languageMinimum, type Cost, type University } from "./domain";
import { deadlineDate } from "./application-dates";
import { baseTier } from "@/components/college/onboarding-plan";
import type { IntakePreferences } from "./student-intake";
import { valueOf } from "./research";

/** "My colleges": the student's own reach / target / safety label and the
 * requirement items they have ticked, per university. Saved inside the
 * existing `profiles.preferences` jsonb (no schema change):
 *
 *   preferences.my_colleges = { [universityId]: { fit?: Fit; done?: string[] } }
 *
 * Everything else here is a pure view-model built only from published data,
 * so a block can hide when its data is missing. */

export type Fit = "reach" | "target" | "safety";
export const FITS: Fit[] = ["reach", "target", "safety"];
export type CollegeEntry = { fit?: Fit; done?: string[] };
export type MyCollegesPrefs = IntakePreferences & { my_colleges?: Record<string, CollegeEntry> };

export function readMyColleges(prefs: unknown): Record<string, CollegeEntry> {
  const raw = (prefs as MyCollegesPrefs | null | undefined)?.my_colleges;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, CollegeEntry> = {};
  for (const [id, v] of Object.entries(raw)) {
    if (!v || typeof v !== "object") continue;
    const fit = FITS.includes(v.fit as Fit) ? (v.fit as Fit) : undefined;
    const done = Array.isArray(v.done) ? v.done.filter((d): d is string => typeof d === "string").slice(0, 40) : undefined;
    out[id] = { ...(fit ? { fit } : {}), ...(done?.length ? { done } : {}) };
  }
  return out;
}

/** Selectivity only (published admission rate, else global rank). */
export function suggestedFit(u: University): Fit | null {
  const tier = baseTier(u);
  return tier === "match" ? "target" : tier;
}

/* ── Application status pipeline ─────────────────────────────────────── */
export type Stage = "researching" | "applying" | "submitted" | "decision";
export const STAGES: Stage[] = ["researching", "applying", "submitted", "decision"];
/** Saved-university statuses (stored as English words) grouped into four steps. */
export function stageOf(status: string | null | undefined): Stage {
  if (status === "Applying") return "applying";
  if (status === "Submitted") return "submitted";
  if (status === "Accepted" || status === "Rejected" || status === "Waitlisted") return "decision";
  return "researching";
}

/* ── Requirements checklist ──────────────────────────────────────────── */
export type RequirementId = "form" | "transcript" | "english" | "tests" | "essays" | "recs" | "portfolio" | "interview" | "fee" | `doc:${string}`;
export type ChecklistRow = { id: RequirementId; detail?: string; label?: string; source_url?: string | null };

const verified = (r: { verification_status?: string | null; canonical?: boolean | null }) =>
  r.verification_status === "verified" && r.canonical !== false;
const href = (u?: string | null) => (u && /^https?:\/\//.test(u) ? u : null);

/** What an application to this university needs, from published data only.
 * "form" and "transcript" are part of every application; every other row
 * appears only when a record says so. */
export function applicationChecklist(u: University): ChecklistRow[] {
  const brief = u.application_brief?.requirements?.join(" ") || "";
  const briefUrl = href(u.application_brief?.requirements_source);
  const ca = u.common_app;
  const ucas = u.country_code === "GB" || u.deadlines.some((d) => /ucas/i.test(d.title));
  const rows: ChecklistRow[] = [];
  rows.push({ id: "form", detail: ca ? "Common App" : ucas ? "UCAS" : undefined, source_url: ca?.url || null });
  rows.push({ id: "transcript" });
  const ielts = languageMinimum(u, "IELTS");
  const toefl = languageMinimum(u, "TOEFL");
  if (ielts || (toefl && toefl > 6))
    rows.push({ id: "english", detail: [ielts ? "IELTS " + ielts : null, toefl && toefl > 6 ? "TOEFL " + toefl : null].filter(Boolean).join(" · ") });
  const testReq = u.requirements.find((r) => verified(r) && /\b(SAT|ACT)\b/.test(r.label) && !r.program_id);
  if (testReq || ca?.test_flexible === false || /\b(SAT|ACT)\b/.test(brief))
    rows.push({ id: "tests", detail: ca?.test_flexible ? "test-flexible" : undefined, source_url: href(testReq?.source_url) || briefUrl });
  if (ca?.essay_required || ucas || /essay|personal statement|motivation letter|written work/i.test(brief))
    rows.push({ id: "essays", detail: ucas && !ca ? "UCAS" : undefined, source_url: ca?.url || briefUrl });
  if (ca?.recs_required || /recommendation|reference/i.test(brief)) rows.push({ id: "recs", source_url: ca?.url || briefUrl });
  if (/portfolio/i.test(brief)) rows.push({ id: "portfolio", source_url: briefUrl });
  if (/interview/i.test(brief)) rows.push({ id: "interview", source_url: briefUrl });
  for (const r of u.requirements) {
    if (r.kind !== "document" || !verified(r) || r.program_id || /english/i.test(r.label)) continue;
    if (rows.filter((x) => x.id.startsWith("doc:")).length >= 2) break;
    rows.push({ id: `doc:${r.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`, label: r.label, source_url: href(r.source_url) });
  }
  const fee = (u.costs as Cost[]).find((c) => c.category === "application_fee" && verified(c) && c.amount > 0);
  if (fee || u.us_stats?.app_fee_ug || ca?.charges_fee) rows.push({ id: "fee", source_url: href(fee?.source_url) });
  return rows;
}

/* ── Deadlines ───────────────────────────────────────────────────────── */
export type TimelineRow = { id: string; title: string; date: string; round: string | null; past: boolean; source_url: string | null };
const ROUNDS: [RegExp, string][] = [
  [/early decision ii|\bED ?2\b/i, "ED II"],
  [/early decision|\bED\b/i, "ED"],
  [/restrictive early action|single.choice early action|\bREA\b|\bSCEA\b/i, "REA"],
  [/early action|\bEA\b/i, "EA"],
  [/regular decision|\bRD\b/i, "RD"],
  [/ucas/i, "UCAS"],
  [/rolling/i, "Rolling"],
  [/scholarship/i, "Aid"],
];
export const roundOf = (title: string) => ROUNDS.find(([re]) => re.test(title))?.[1] ?? null;

/** Every published, verified deadline for the latest cycle, oldest first. */
export function deadlineTimeline(u: University, today = new Date().toISOString().slice(0, 10)): TimelineRow[] {
  const rows = u.deadlines
    .filter((d) => verified(d))
    .map((d) => ({ d, date: deadlineDate(d) }))
    .filter(({ date }) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  const upcoming = rows.filter((r) => r.date >= today);
  const pick = upcoming.length ? upcoming : rows.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  return pick
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ d, date }) => ({
      id: d.id,
      title: d.title.replace(/^Undergraduate application:\s*/i, ""),
      date,
      round: roundOf(d.title + " " + (d.student_category || "")),
      past: date < today,
      source_url: href(d.source_url) || href(d.application_url),
    }));
}

/** The next deadline the student should look at: their own planning date
 * first, then the university's next published one. */
export function nextDeadline(u: University | undefined, own: string | null | undefined, today: string) {
  const dates = [
    ...(own && own >= today ? [{ date: own, own: true }] : []),
    ...(u ? deadlineTimeline(u, today).filter((d) => !d.past).map((d) => ({ date: d.date, own: false })) : []),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return dates[0] || null;
}

/* ── Your scores vs the published range ──────────────────────────────── */
export type StudentScores = { sat?: number; act?: number; ielts?: number; toefl?: number };

export function studentScores(prefs: unknown): StudentScores {
  const p = (prefs || {}) as IntakePreferences & { intake?: { details?: Record<string, unknown> } };
  const i = p.intake || {};
  const d = (i as { details?: Record<string, unknown> }).details || {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(+v) ? +v : undefined);
  const out: StudentScores = {};
  const taken = d.sat_status === undefined || d.sat_status === "taken";
  const satScore = taken ? num(d.sat_score) ?? num(i.sat) : undefined;
  if (satScore != null) {
    if (d.sat_test === "act" && satScore >= 1 && satScore <= 36) out.act = satScore;
    else if (satScore >= 400 && satScore <= 1600) out.sat = satScore;
  }
  const eng = num(i.english_score);
  if (eng != null && (d.english_status === undefined || d.english_status === "taken")) {
    if (i.english_test === "ielts" && eng > 0 && eng <= 9) out.ielts = eng;
    if (i.english_test === "toefl" && eng > 6 && eng <= 120) out.toefl = eng;
  }
  return out;
}

export type ScoreBand = {
  test: "SAT" | "ACT" | "IELTS" | "TOEFL";
  kind: "range" | "average" | "minimum";
  low: number;
  high: number;
  /** Scale shown on the bar. */
  min: number;
  max: number;
  you?: number;
  verdict?: "above" | "within" | "below" | "meets" | "short";
  source_url?: string | null;
  /** Academic year of the figure, when the source states one ("2025/26"). */
  year?: string;
};

function verdictFor(b: Omit<ScoreBand, "verdict">): ScoreBand["verdict"] {
  if (b.you == null) return undefined;
  if (b.kind === "minimum") return b.you >= b.low ? "meets" : "short";
  if (b.kind === "average") return b.you >= b.low ? "above" : "below";
  return b.you > b.high ? "above" : b.you >= b.low ? "within" : "below";
}

/** Published admitted ranges or minimums for each test, with the student's score
 * placed on the same scale. Only tests the university publishes appear. */
export function scoreBands(u: University, you: StudentScores): ScoreBand[] {
  const out: ScoreBand[] = [];
  const a = admission(u);
  const cds = u.cds;
  // Latest federal figures first after the university's own Common Data Set: section 25th/75th summed.
  const cur = u.us_current;
  const curSat = cur?.sat_reading_25 && cur.sat_math_25 && cur.sat_reading_75 && cur.sat_math_75
    ? { low: cur.sat_reading_25 + cur.sat_math_25, high: cur.sat_reading_75 + cur.sat_math_75, kind: "range" as const, src: "https://collegescorecard.ed.gov/data/", year: cur.academic_year }
    : null;
  const sat = cds?.sat_composite?.[0] && cds.sat_composite[2]
    ? { low: cds.sat_composite[0], high: cds.sat_composite[2], kind: "range" as const, src: cds.cds_url, year: undefined }
    : curSat ?? (a?.sat_min && a.sat_max
      ? { low: a.sat_min, high: a.sat_max, kind: "range" as const, src: a.source_url, year: undefined }
      : u.scorecard?.sat_avg
        ? { low: Math.round(u.scorecard.sat_avg), high: Math.round(u.scorecard.sat_avg), kind: "average" as const, src: "https://collegescorecard.ed.gov/", year: undefined }
        : null);
  if (sat) {
    const b = { test: "SAT" as const, kind: sat.kind, low: sat.low, high: sat.high, min: 400, max: 1600, you: you.sat, source_url: href(sat.src), year: sat.year };
    out.push({ ...b, verdict: verdictFor(b) });
  }
  const act = cds?.act_composite?.[0] && cds.act_composite[2]
    ? { low: cds.act_composite[0], high: cds.act_composite[2], kind: "range" as const, src: cds.cds_url, year: undefined as string | undefined }
    : cur?.act_25 && cur.act_75
      ? { low: cur.act_25, high: cur.act_75, kind: "range" as const, src: "https://collegescorecard.ed.gov/data/", year: cur.academic_year }
      : a?.act_min && a.act_max
        ? { low: a.act_min, high: a.act_max, kind: "range" as const, src: a.source_url, year: undefined }
        : u.scorecard?.act_mid
          ? { low: Math.round(u.scorecard.act_mid), high: Math.round(u.scorecard.act_mid), kind: "average" as const, src: "https://collegescorecard.ed.gov/", year: undefined }
          : null;
  if (act) {
    const b = { test: "ACT" as const, kind: act.kind, low: act.low, high: act.high, min: 1, max: 36, you: you.act, source_url: href(act.src), year: act.year };
    out.push({ ...b, verdict: verdictFor(b) });
  }
  const ielts = languageMinimum(u, "IELTS");
  if (ielts && ielts > 0 && ielts <= 9) {
    const b = { test: "IELTS" as const, kind: "minimum" as const, low: ielts, high: ielts, min: 4, max: 9, you: you.ielts };
    out.push({ ...b, verdict: verdictFor(b) });
  }
  const toefl = languageMinimum(u, "TOEFL");
  if (toefl && toefl > 6 && toefl <= 120) {
    const b = { test: "TOEFL" as const, kind: "minimum" as const, low: toefl, high: toefl, min: 40, max: 120, you: you.toefl };
    out.push({ ...b, verdict: verdictFor(b) });
  }
  return out;
}

/** Published yearly international tuition against the student's yearly budget
 * (same currency only; US public universities use the out-of-state rate). */
export function budgetCheck(u: University, prefs: unknown) {
  const p = (prefs || {}) as IntakePreferences;
  let t = valueOf(u, "tuition");
  if ((t.value == null || !t.currency) && u.country_code === "US") {
    const out = valueOf(u, "tuition_out_of_state");
    if (out.value != null) t = { ...out, currency: out.currency || "USD" };
  }
  if (t.value == null || !(t.value > 0)) return null;
  const cur = t.currency || "USD";
  const wantsCurrency = p.currency || "USD";
  const budget = p.budget && p.budget > 0 && wantsCurrency === cur ? p.budget : null;
  return { tuition: t.value, currency: cur, budget, over: budget != null ? t.value - budget : 0 };
}

/* ── Home: what to fix next ──────────────────────────────────────────── */
export type Gap =
  | { id: "empty" }
  | { id: "english" }
  | { id: "sat" }
  | { id: "english_low"; n: number }
  | { id: "unsorted"; n: number }
  | { id: "safety" }
  | { id: "soon"; name: string; days: number; href: string };

/** Up to four gaps, most urgent first, from the profile, the list and its deadlines. */
export function homeGaps(input: {
  prefs: unknown;
  list: { id: string; status: string; university?: University; deadline?: string | null }[];
  fits: Record<string, Fit | undefined>;
  today: string;
}): Gap[] {
  const { prefs, list, fits, today } = input;
  const you = studentScores(prefs);
  const out: Gap[] = [];
  for (const x of list) {
    if (!x.university || stageOf(x.status) !== "researching" && stageOf(x.status) !== "applying") continue;
    const next = nextDeadline(x.university, x.deadline, today);
    if (!next) continue;
    const days = Math.round((Date.parse(next.date) - Date.parse(today)) / 864e5);
    if (days <= 21) {
      out.push({ id: "soon", name: x.university.name, days, href: "/dashboard/university/" + x.university.slug });
      break;
    }
  }
  if (!list.length) out.push({ id: "empty" });
  if (you.ielts == null && you.toefl == null) out.push({ id: "english" });
  else {
    const low = list.filter((x) => x.university && scoreBands(x.university, you).some((b) => b.verdict === "short")).length;
    if (low) out.push({ id: "english_low", n: low });
  }
  if (you.sat == null && you.act == null && list.some((x) => x.university?.country_code === "US")) out.push({ id: "sat" });
  const unsorted = list.filter((x) => !fits[x.id]).length;
  if (unsorted) out.push({ id: "unsorted", n: unsorted });
  else if (list.length >= 3 && !list.some((x) => fits[x.id] === "safety")) out.push({ id: "safety" });
  return out.slice(0, 4);
}
