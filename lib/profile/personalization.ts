"use client";
import { useMemo } from "react";
import { useCollege } from "@/components/college/provider";
import { readPersonalization, type SavedPersonalization } from "@/lib/personalize-ai";
import { snapshotFrom, type StudentSnapshot } from "@/lib/student-profile";

/**
 * For the dashboard home and other screens: the student's profile snapshot and
 * the latest "Personalise with AI" result, both read from the signed-in
 * profile (preferences.ai_personalize). No fetches; null/empty when signed out.
 *
 *   const { report, snapshot } = usePersonalization();
 *   report?.universities  // [{ slug, name, country_code, tier: "reach"|"target"|"safety", reason }]
 *   report?.actions       // [{ title, detail, due: "YYYY-MM-DD" }] (5, date order)
 *   report?.gaps, report?.country_mix, report?.summary, report?.created_at
 *
 * UI to mount: <PersonalizeCard /> from
 * components/college/personalize-report.tsx (button + report card).
 */
export function usePersonalization(): { report: SavedPersonalization | null; snapshot: StudentSnapshot | null } {
  const s = useCollege();
  const prefs = s.user ? s.profile?.preferences : undefined;
  return useMemo(
    () => (prefs ? { report: readPersonalization(prefs), snapshot: snapshotFrom(prefs) } : { report: null, snapshot: null }),
    [prefs],
  );
}

export { readPersonalization, type SavedPersonalization, type StudentSnapshot };
