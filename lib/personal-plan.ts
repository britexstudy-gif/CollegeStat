import type { PersonalPlan } from "@/components/college/onboarding-plan";

/** The onboarding plan saved in the student's profile preferences. The
 * onboarding rebuild decides the exact key, so look at the likely ones and
 * accept only a well-formed version 1 plan. */
export function readPlan(prefs: unknown): PersonalPlan | null {
  const p = (prefs || {}) as Record<string, unknown>;
  for (const key of ["personal_plan"]) {
    const v = p[key] as Partial<PersonalPlan> | undefined;
    if (v && v.version === 1 && Array.isArray(v.universities) && Array.isArray(v.timeline) && Array.isArray(v.scholarships) && Array.isArray(v.tests))
      return v as PersonalPlan;
  }
  return null;
}

export type LegacyPlan = { summary: string; steps: { title: string; detail: string }[] };
/** Older students saved a short AI plan (preferences.ai_plan) instead. */
export function readLegacyPlan(prefs: unknown): LegacyPlan | null {
  const v = (prefs as { ai_plan?: Partial<LegacyPlan> } | null)?.ai_plan;
  return v && typeof v.summary === "string" && Array.isArray(v.steps) ? (v as LegacyPlan) : null;
}
