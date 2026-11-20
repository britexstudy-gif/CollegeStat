import type { Preferences } from "./research";

/** Answers from the onboarding questionnaire, stored privately in
 * profiles.preferences next to the existing research preferences. */
export type StudentIntake = {
  stage?: "high_school" | "gap_year" | "bachelors" | "masters" | "working";
  graduation_year?: number;
  curriculum?: string;
  grade?: string;
  english_test?: "ielts" | "toefl" | "duolingo" | "none" | "native";
  english_score?: number;
  sat?: number;
  start_year?: number;
  goal_level?: "bachelor" | "master" | "phd" | "foundation";
  priorities?: string[];
  completed_at?: string;
  skipped_at?: string;
};

export type IntakePreferences = Preferences & {
  intake?: StudentIntake;
  ai_plan?: {
    summary: string;
    steps: { title: string; detail: string }[];
    created_at: string;
    source: "ai" | "rules";
  };
  /** Built at the end of onboarding; shape documented in components/college/onboarding-plan.ts. */
  personal_plan?: import("@/components/college/onboarding-plan").PersonalPlan;
  dashboard?: { hidden?: string[] };
};

/** How much of the questionnaire is answered, for the profile meter. */
export function intakeCompleteness(p: IntakePreferences | undefined) {
  const i = p?.intake || {};
  const checks = [
    !!i.stage,
    !!i.goal_level,
    !!p?.field,
    !!p?.countries?.length,
    !!i.curriculum,
    !!i.english_test,
    p?.budget != null,
    !!i.priorities?.length,
  ];
  const done = checks.filter(Boolean).length;
  return {
    done,
    total: checks.length,
    pct: Math.round((done / checks.length) * 100),
  };
}
