/**
 * Builds the personalised plan from the onboarding answers and real catalogue
 * records. Pure (no fetches), so tests can feed it fixtures; the fetching lives
 * in onboarding-personalize.tsx.
 *
 * SAVED SHAPE (all inside the existing `profiles.preferences` jsonb column, so
 * no schema change; written by the existing `saveProfile` helper):
 *
 *   preferences.countries / field / budget / currency / aid   shared research prefs
 *   preferences.intake                                         StudentIntake (stage, goal_level,
 *                                                              graduation_year, start_year,
 *                                                              curriculum, grade, english_test,
 *                                                              english_score, sat, priorities,
 *                                                              completed_at)
 *   preferences.intake.details                                 IntakeDetails (onboarding-steps.ts):
 *       home_country, home_city, school_type, certificate, grade_scale, grade_value,
 *       subjects[], funding ("family"|"partial"|"full"), english_status/english_target/english_date,
 *       sat_status/sat_test/sat_score/sat_target/sat_date, activities[], activity_list[], honours[], tests[],
 *       school_name, school_class, grade_norm {pct,gpa}, exam {id,score},
 *       languages[], apply_count, support[], interface_lang
 *   preferences.personal_plan                                  PersonalPlan (below), rebuilt at the
 *                                                              end of onboarding:
 *       { version: 1, created_at,
 *         universities: PlanUniversity[]  // tier reach|match|safety, rank {provider, rank},
 *                                         // acceptance %, tuition_usd, within_budget, english_min
 *                                         // {test, minimum, source_url}, meets_english
 *         tests: PlanTest[]               // kind "english" | "sat" with status/score/target/date and
 *                                         // highest_min or us_range from the plan's universities
 *         timeline: PlanEvent[]           // dated deadlines, scholarship deadlines, test dates
 *         scholarships: PlanScholarship[] // Central-Asia-eligible bachelor's awards
 *         tailored?: PlanNote[]           // short notes from the deeper answers (strength, budget, goals) }
 *
 *   Deeper answers (Nov 16) also live in preferences.intake.details (DeepAnswers in onboarding-steps.ts):
 *       class_rank, strong_subjects[], research, exam_status/exam_date/exam_target, tests_declined[],
 *       activity_depth {area: {years, hours}}, interests {enjoy, subject, day}, career, work_after,
 *       return_home, study_langs[], foundation, city_size, climate, setting, safety, distance, halal,
 *       rank_vs_cost (0–100), loan, intake_term, app_hours, helpers[]; honours[].medal
 *
 *   preferences.ai_personalize                                 SavedPersonalization (lib/personalize-ai.ts),
 *                                                              written by "Personalise with AI"; read it
 *                                                              with usePersonalization() (lib/profile/personalization.ts)
 *
 * While answering, each step is also kept in localStorage ("cs-onboarding-draft")
 * as a fallback if a save fails. Missing values are simply absent, never empty strings.
 */
import { languageMinimum, admission, type University } from "@/lib/domain";
import { valueOf } from "@/lib/research";
import { profileStrength, tuitionUSD, type StrengthLevel } from "@/lib/admission-chance";
import { normalizeGrade } from "@/lib/grades/convert";
import { eligibleFor, type Scholarship } from "@/lib/scholarships-data";
import { CENTRAL_ASIA } from "@/lib/scholarships-data";
import { englishTest, numberIn, satTest, testScore, type Answers } from "./onboarding-steps";

export type Tier = "reach" | "match" | "safety";

export type PlanUniversity = {
  id: string;
  slug: string;
  name: string;
  country_code: string;
  city: string | null;
  tier: Tier;
  /** Best global rank (QS, THE or ARWU), when published. */
  rank?: { provider: string; rank: number };
  /** Admission rate in %, when published. */
  acceptance?: number;
  /** Yearly tuition for international students in USD, when published. */
  tuition_usd?: number;
  within_budget?: boolean;
  /** University-wide English minimum for the student's test (IELTS when no test). */
  english_min?: { test: string; minimum: number; source_url?: string };
  meets_english?: boolean;
};

export type PlanTest =
  | {
      kind: "english";
      status: NonNullable<Answers["english_status"]>;
      test?: string;
      score?: number;
      target?: number;
      date?: string;
      /** Highest published minimum among the plan's universities. */
      highest_min?: { minimum: number; university: string; slug: string };
      meets_all?: boolean;
    }
  | {
      kind: "sat";
      status: NonNullable<Answers["sat_status"]>;
      test?: "sat" | "act";
      score?: number;
      target?: number;
      date?: string;
      /** Applying to the US, where SAT/ACT scores are most used. */
      us: boolean;
      /** Published SAT middle range at the plan's US universities. */
      us_range?: { low: number; high: number; universities: number };
    };

export type PlanEvent = {
  date: string;
  kind: "deadline" | "scholarship" | "english" | "sat";
  title?: string;
  university?: string;
  href?: string;
  source_url?: string;
};

export type PlanScholarship = {
  slug: string;
  name: string;
  country: string | null;
  funding: "full" | "partial";
  deadline: string | null;
  provider: string | null;
};

/** One tailored line on the plan; `id` picks the message (obd.tl.<id>). */
export type PlanNote = { id: "first" | StrengthLevel | "budget" | "aid" | "loan" | "work" | "home" | "foundation" | "lang" | "time"; vars?: Record<string, string> };

export type PersonalPlan = {
  version: 1;
  created_at: string;
  universities: PlanUniversity[];
  tests: PlanTest[];
  timeline: PlanEvent[];
  scholarships: PlanScholarship[];
  tailored?: PlanNote[];
};

const GLOBAL = ["qs", "the", "arwu"];

function bestRank(u: University) {
  let best: { provider: string; rank: number } | undefined;
  for (const r of u.rankings || [])
    if (GLOBAL.includes(r.provider) && Number.isFinite(r.rank) && r.rank > 0 && (!best || r.rank < best.rank))
      best = { provider: r.provider, rank: r.rank };
  return best;
}

const acceptance = (u: University) => {
  const v = valueOf(u, "admission").value;
  return v != null && v > 0 && v <= 100 ? v : undefined;
};

/** Selectivity only: published admission rate first, then global rank. */
export function baseTier(u: University): Tier | null {
  const rate = acceptance(u);
  if (rate != null) return rate < 25 ? "reach" : rate <= 60 ? "match" : "safety";
  const rank = bestRank(u)?.rank;
  if (rank == null) return null;
  return rank <= 100 ? "reach" : rank <= 500 ? "match" : "safety";
}

const harder = (t: Tier): Tier => (t === "safety" ? "match" : "reach");

function englishFor(u: University, a: Answers) {
  const test = a.english_status === "taken" || a.english_status === "planned" ? a.english_test : undefined;
  const kind = test === "toefl" ? "TOEFL" : "IELTS";
  const minimum = languageMinimum(u, kind);
  // Some TOEFL minimums use the new 1–6 band scale; only compare like with like.
  if (minimum == null || (kind === "TOEFL" && minimum <= 6)) return undefined;
  const source = u.requirements?.find((r) => r.kind === kind && r.minimum === minimum);
  return { test: kind === "TOEFL" ? "TOEFL iBT" : "IELTS", minimum, source_url: source?.source_url || source?.data_sources?.url };
}

function describeUniversity(u: University, a: Answers): PlanUniversity | null {
  let tier = baseTier(u);
  if (!tier) return null;
  const english = englishFor(u, a);
  const t = englishTest(a.english_test);
  const score = t && a.english_status === "taken" ? numberIn(a.english_score, t.min, t.max) : undefined;
  const sameTest = english && ((english.test === "IELTS" && a.english_test === "ielts") || (english.test === "TOEFL iBT" && a.english_test === "toefl"));
  const meets = english && sameTest && score != null ? score >= english.minimum : undefined;
  if (meets === false) tier = harder(tier);
  const tuition = tuitionUSD(u);
  const budget = a.funding === "full" ? undefined : a.budget && a.budget > 0 && a.budget < 90000 ? a.budget : undefined;
  return {
    id: u.id,
    slug: u.slug,
    name: u.name,
    country_code: u.country_code,
    city: u.city,
    tier,
    rank: bestRank(u),
    acceptance: acceptance(u),
    tuition_usd: tuition,
    within_budget: tuition != null && budget != null ? tuition <= budget : undefined,
    english_min: english,
    meets_english: meets,
  };
}

/** How much ranking outweighs cost, 0–1 (the slider, else the older priorities). */
const rankWeight = (a: Answers) =>
  a.rank_vs_cost != null ? a.rank_vs_cost / 100 : a.priorities.includes("ranking") ? 0.75 : a.priorities.includes("cost") ? 0.25 : 0.5;

/** Over budget is a hard stop only when the family pays alone and rules out a loan. */
const budgetIsHard = (a: Answers) => a.funding === "family" && a.loan !== "yes" && a.loan !== "maybe";

/** Order inside a tier: affordable and English-ready first, then by rank, weighted by the cost/ranking slider. */
function score(p: PlanUniversity, a: Answers) {
  const w = rankWeight(a);
  let s = 0;
  if (p.within_budget === true) s += 1 + 3 * (1 - w);
  if (p.within_budget === false) s -= a.funding === "family" ? (a.loan === "yes" ? 1.5 : 3) : 1;
  if (p.meets_english === true) s += 1;
  if (p.rank) s += 4 * w * (p.rank.rank <= 100 ? 1 : p.rank.rank <= 300 ? 0.6 : 0.25);
  // Earlier destination choices count a little more.
  const order = a.countries.indexOf(p.country_code);
  if (order >= 0) s += (a.countries.length - order) * 0.15;
  return s - (p.rank?.rank ?? 2000) / 2000;
}

/** Up to `perTier` universities per tier, spread across the student's countries. */
export function pickUniversities(candidates: University[], a: Answers, perTier = 3): PlanUniversity[] {
  const seen = new Set<string>();
  const described = candidates
    .filter((u) => (seen.has(u.id) ? false : (seen.add(u.id), true)))
    .map((u) => describeUniversity(u, a))
    .filter((p): p is PlanUniversity => !!p);
  const out: PlanUniversity[] = [];
  for (const tier of ["reach", "match", "safety"] as Tier[]) {
    let pool = described.filter((p) => p.tier === tier).sort((x, y) => score(y, a) - score(x, a));
    // Family-only funding: leave over-budget universities out while enough others remain.
    if (budgetIsHard(a)) {
      const affordable = pool.filter((p) => p.within_budget !== false);
      if (affordable.length >= perTier) pool = affordable;
    }
    const chosen: PlanUniversity[] = [];
    // Round-robin over countries in the student's order, best first.
    const order = [...a.countries, ...new Set(pool.map((p) => p.country_code))];
    while (chosen.length < perTier && pool.length) {
      const before = chosen.length;
      for (const c of order) {
        const i = pool.findIndex((p) => p.country_code === c);
        if (i >= 0 && chosen.length < perTier) chosen.push(...pool.splice(i, 1));
      }
      if (chosen.length === before) break;
    }
    out.push(...chosen);
  }
  return out;
}

function testPlan(a: Answers, picks: PlanUniversity[], full: University[]): PlanTest[] {
  const tests: PlanTest[] = [];
  if (a.english_status) {
    const t = englishTest(a.english_test);
    const value = t ? numberIn(a.english_score, t.min, t.max) : undefined;
    const sameKind = a.english_test === "toefl" ? "TOEFL iBT" : a.english_test === "ielts" || !a.english_test ? "IELTS" : null;
    const mins = picks.filter((p) => p.english_min && p.english_min.test === sameKind);
    const top = mins.sort((x, y) => y.english_min!.minimum - x.english_min!.minimum)[0];
    tests.push({
      kind: "english",
      status: a.english_status,
      test: t?.label,
      score: a.english_status === "taken" ? value : undefined,
      target: a.english_status === "planned" ? value : undefined,
      date: a.english_date || undefined,
      highest_min: top ? { minimum: top.english_min!.minimum, university: top.name, slug: top.slug } : undefined,
      meets_all: top && a.english_status === "taken" && value != null ? value >= top.english_min!.minimum : undefined,
    });
  }
  const us = a.countries.includes("US");
  if (a.sat_status || us) {
    const ranges = full
      .filter((u) => u.country_code === "US" && picks.some((p) => p.id === u.id))
      .map((u) => admission(u))
      .filter((r) => r?.sat_min && r?.sat_max) as { sat_min: number; sat_max: number }[];
    const t = satTest(a.sat_test);
    const value = t ? numberIn(a.sat_score, t.min, t.max) : undefined;
    tests.push({
      kind: "sat",
      status: a.sat_status || "unsure",
      test: a.sat_test,
      score: a.sat_status === "taken" ? value : undefined,
      target: a.sat_status === "planned" ? value : undefined,
      date: a.sat_date || undefined,
      us,
      us_range: ranges.length
        ? {
            low: Math.min(...ranges.map((r) => r.sat_min)),
            high: Math.max(...ranges.map((r) => r.sat_max)),
            universities: ranges.length,
          }
        : undefined,
    });
  }
  return tests;
}

const isBachelor = (s: Scholarship) => /bachelor|any|undergrad/i.test(s.level);

/** Bachelor's awards the student can apply for from their home country (Central Asia by default). */
export function matchScholarships(all: Scholarship[], a: Answers, today: string, limit = 4): PlanScholarship[] {
  const home = a.home_country && (CENTRAL_ASIA as readonly string[]).includes(a.home_country) ? [a.home_country] : a.home_country ? [a.home_country] : [...CENTRAL_ASIA];
  return all
    .filter((s) => isBachelor(s) && home.some((c) => eligibleFor(s, c)) && (!s.deadline || s.deadline >= today))
    .map((s) => {
      let n = 0;
      if (s.country && a.countries.includes(s.country)) n += 4;
      if (s.funding === "full" && a.funding !== "family") n += 2;
      if (s.eligibleCodes.length && !s.openToAll) n += 1; // named for the region
      if (s.deadline) n += 1;
      return [s, n] as const;
    })
    .sort((x, y) => y[1] - x[1] || (x[0].deadline ?? "9999").localeCompare(y[0].deadline ?? "9999"))
    .slice(0, limit)
    .map(([s]) => ({ slug: s.slug, name: s.name, country: s.country, funding: s.funding, deadline: s.deadline, provider: s.provider }));
}

function timeline(a: Answers, picks: PlanUniversity[], full: University[], scholarships: PlanScholarship[], today: string, limit = 8): PlanEvent[] {
  const events: PlanEvent[] = [];
  for (const u of full) {
    const pick = picks.find((p) => p.id === u.id);
    if (!pick) continue;
    for (const d of u.deadlines || []) {
      const date = (d.due_date || d.due_at || "").slice(0, 10);
      if (date >= today)
        events.push({ date, kind: "deadline", title: d.title, university: u.name, href: "/university/" + u.slug, source_url: d.source_url || d.application_url });
    }
  }
  for (const s of scholarships)
    if (s.deadline && s.deadline >= today) events.push({ date: s.deadline, kind: "scholarship", title: s.name, href: "/scholarships/" + s.slug });
  if (a.english_date && (a.english_status === "planned" || a.english_status === "taken") && a.english_date >= today.slice(0, 7))
    events.push({ date: a.english_date, kind: "english", title: englishTest(a.english_test)?.label });
  if (a.sat_date && (a.sat_status === "planned" || a.sat_status === "taken") && a.sat_date >= today.slice(0, 7))
    events.push({ date: a.sat_date, kind: "sat", title: satTest(a.sat_test)?.label });
  const seen = new Set<string>();
  return events
    .sort((x, y) => x.date.localeCompare(y.date))
    .filter((e) => {
      const key = e.date + (e.title || "") + (e.university || "");
      return seen.has(key) ? false : (seen.add(key), true);
    })
    .slice(0, limit);
}

export function buildPlan(a: Answers, picks: PlanUniversity[], full: University[], scholarships: Scholarship[], now = new Date()): PersonalPlan {
  const today = now.toISOString().slice(0, 10);
  // Full records carry requirements; re-describe so English checks use them.
  const described = picks.map((p) => {
    const u = full.find((x) => x.id === p.id);
    const again = u ? describeUniversity(u, a) : null;
    return again ? { ...again, tier: p.tier === "reach" || again.tier === "reach" ? (again.tier === "safety" ? p.tier : again.tier) : again.tier } : p;
  });
  const awards = matchScholarships(scholarships, a, today);
  return {
    version: 1,
    created_at: now.toISOString(),
    universities: described,
    tests: testPlan(a, described, full),
    timeline: timeline(a, described, full, awards, today),
    scholarships: awards,
    tailored: tailoredNotes(a, described),
  };
}

/** Government awards that fund study abroad and expect graduates back home. */
const HOME_AWARD: Record<string, string> = { UZ: "El-Yurt Umidi", KZ: "Bolashak" };

/** The student's strength from the answers (same rules as the chance chips). */
export function answersStrength(a: Answers) {
  const taken = (id: string) => {
    const t = a.tests.find((x) => x.id === id && x.status === "taken");
    const v = t && testScore(t.id, t.score);
    return v ? Number(v) : undefined;
  };
  const norm = a.grade_scale && a.grade.trim() ? normalizeGrade(a.grade_scale, a.grade) : null;
  return profileStrength({
    gradePct: norm?.pct,
    classRank: a.class_rank,
    honours: a.honours.filter((h) => h.title.trim()),
    sat: taken("sat"),
    act: taken("act"),
    ielts: taken("ielts"),
    toefl: taken("toefl"),
    research: a.research,
    depth: Object.values(a.activity_depth || {}).filter(Boolean) as { years: string; hours?: string }[],
  });
}

/** Up to 5 short notes that show the plan used the deeper answers. */
export function tailoredNotes(a: Answers, picks: PlanUniversity[]): PlanNote[] {
  const notes: PlanNote[] = [];
  if (a.subjects[0]) notes.push({ id: "first", vars: { programme: a.subjects[0] } });
  const strength = answersStrength(a);
  if (strength) notes.push({ id: strength.level });
  if (budgetIsHard(a) && a.budget && a.budget < 90000 && (picks.length === 0 || picks.some((p) => p.tuition_usd != null))) notes.push({ id: "budget" });
  if (a.funding && a.funding !== "family") notes.push({ id: "aid" });
  else if (a.loan === "yes") notes.push({ id: "loan" });
  if (a.work_after === "must") notes.push({ id: "work" });
  if (a.return_home === "yes" && a.home_country && HOME_AWARD[a.home_country]) notes.push({ id: "home", vars: { name: HOME_AWARD[a.home_country] } });
  if (a.foundation && a.foundation !== "no" && a.certificate === "attestat" && a.countries.includes("GB")) notes.push({ id: "foundation" });
  const other = (a.study_langs || []).filter((l) => l !== "english");
  if (other.length) notes.push({ id: "lang", vars: { langs: other.join(",") } });
  if (a.app_hours === "lt3") notes.push({ id: "time" });
  return notes.slice(0, 6);
}

/** One concrete next step on the result screen; `id` picks the message (obq.ns.<id>). */
export type NextStep = { id: string; vars?: Record<string, string | number>; href?: string };

/** Up to 4 short, rule-based next steps from the answers and the plan (no invented numbers). */
export function nextSteps(a: Answers, plan: PersonalPlan, limit = 4): NextStep[] {
  const out: NextStep[] = [];
  if (!a.grade.trim()) out.push({ id: "grades", href: "/dashboard/welcome?step=gpa" });
  const english = plan.tests.find((x) => x.kind === "english");
  if (!english) {
    const mins = plan.universities.filter((u) => u.english_min?.test === "IELTS");
    const high = mins.sort((x, y) => y.english_min!.minimum - x.english_min!.minimum)[0];
    const top = high ? { minimum: high.english_min!.minimum, university: high.name } : undefined;
    out.push(top ? { id: "english.book", vars: { university: top.university, min: "IELTS " + top.minimum } } : { id: "english.plain" });
  } else if (english.kind === "english" && english.status === "taken" && english.meets_all === false && english.highest_min) {
    out.push({ id: "english.retake", vars: { university: english.highest_min.university, min: english.highest_min.minimum } });
  } else if (english.kind === "english" && english.status === "planned" && english.date) {
    out.push({ id: "english.planned", vars: { date: english.date } });
  }
  const sat = plan.tests.find((x) => x.kind === "sat");
  if (sat && sat.kind === "sat" && sat.us && sat.status !== "taken")
    out.push(sat.us_range ? { id: "sat.range", vars: { low: sat.us_range.low, high: sat.us_range.high } } : { id: "sat.plain" });
  if (plan.universities.length) out.push({ id: "list" });
  const award = plan.scholarships.find((s) => s.deadline);
  if (award && a.funding !== "family") out.push({ id: "scholarship", vars: { name: award.name, date: award.deadline! }, href: "/scholarships/" + award.slug });
  const deadline = plan.timeline.find((e) => e.kind === "deadline");
  if (deadline) out.push({ id: "deadline", vars: { name: deadline.university || deadline.title || "", date: deadline.date }, href: deadline.href });
  out.push({ id: "essay" });
  return out.slice(0, limit);
}
