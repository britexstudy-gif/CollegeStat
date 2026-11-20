import { answersFrom, testScore, type ActivityEntry, type DeepAnswers, type HonourEntry, type TestEntry } from "@/components/college/onboarding-steps";
import { examFor, examPercent, normalizeGrade, type GradeScale, type Normalized } from "@/lib/grades/convert";
import type { IntakePreferences } from "@/lib/student-intake";
import { profileStrength, type ChanceProfile } from "@/lib/admission-chance";

/** The deeper onboarding answers, for chances and the AI (no free text). */
export type StudentContext = Partial<Omit<DeepAnswers, "exam_date" | "interests">> & { interests?: DeepAnswers["interests"] };

/** The student's profile in one read-only shape, for the
 * personal chips and the AI personalisation. Built from `profiles.preferences`
 * (no name or email). */
export type StudentSnapshot = {
  home?: string;
  dreams: string[];
  majors: string[];
  budget?: number;
  funding?: "family" | "partial" | "full";
  start_year?: number;
  school_class?: string;
  grade?: { scale: GradeScale; value: string } & Normalized;
  exam?: { id: string; score: string; pct: number | null };
  tests: TestEntry[];
  activities: ActivityEntry[];
  honours: HonourEntry[];
  /** Answered deep questions only (empty object when none). */
  context?: StudentContext;
};

export function snapshotFrom(prefs: unknown): StudentSnapshot {
  const p = (prefs || {}) as IntakePreferences;
  const a = answersFrom(p, null);
  const norm = a.grade_scale ? normalizeGrade(a.grade_scale, a.grade) : null;
  const exam = examFor(a.home_country);
  return {
    home: a.home_country,
    dreams: a.countries,
    majors: a.subjects,
    budget: a.funding === "full" ? undefined : p.budget,
    funding: a.funding,
    start_year: a.start_year,
    school_class: a.school_class,
    grade: norm && a.grade_scale ? { scale: a.grade_scale, value: a.grade, ...norm } : undefined,
    // A planned national exam keeps its target in exam_score; only a taken one is a result.
    exam: exam && a.exam_score && a.exam_status !== "planned" ? { id: exam, score: a.exam_score, pct: examPercent(exam, a.exam_score) } : undefined,
    tests: a.tests.filter((t) => t.status === "planned" || testScore(t.id, t.score)),
    activities: a.activity_list,
    honours: a.honours.filter((h) => h.title.trim()),
    context: contextFrom(a),
  };
}

function contextFrom(a: ReturnType<typeof answersFrom>): StudentContext {
  const out: Record<string, unknown> = {};
  const keys = [
    "class_rank", "strong_subjects", "research", "exam_status", "tests_declined", "activity_depth", "interests", "career",
    "work_after", "return_home", "study_langs", "foundation", "city_size", "climate", "setting", "safety", "distance",
    "halal", "rank_vs_cost", "loan", "intake_term", "app_hours", "helpers",
  ] as const;
  for (const k of keys) {
    const v = a[k];
    if (v == null || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length)) continue;
    out[k] = v;
  }
  return out as StudentContext;
}

/** Taken scores only: planned targets never count toward a chance. */
export function chanceProfile(s: StudentSnapshot): ChanceProfile {
  const taken = (id: string) => {
    const t = s.tests.find((x) => x.id === id && x.status === "taken");
    const v = t && testScore(t.id, t.score);
    return v ? Number(v) : undefined;
  };
  const sat = taken("sat"),
    act = taken("act"),
    ielts = taken("ielts"),
    toefl = taken("toefl");
  const strength = profileStrength({
    gradePct: s.grade?.pct,
    classRank: s.context?.class_rank,
    honours: s.honours,
    sat,
    act,
    ielts,
    toefl,
    research: s.context?.research,
    depth: Object.values(s.context?.activity_depth || {}).flatMap((d) => (d ? [d] : [])),
  });
  return {
    sat,
    act,
    ielts,
    toefl,
    // "No limit" (the top choice) is stored as 90000.
    budget: s.budget && s.budget < 90000 ? s.budget : undefined,
    ...(strength ? { strength: strength.level } : {}),
  };
}

/** Whether there is enough of a profile to personalise anything. */
export const hasProfile = (s: StudentSnapshot) => !!s.home || s.dreams.length > 0;
