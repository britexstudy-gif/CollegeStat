import snapshot from "@/data/published/study-resources-oct09.json";

export type LearningResource = {
  id: string;
  slug: string;
  title: string;
  provider: string;
  subject: string;
  kind: "practice" | "destination";
  url: string;
  summary: string;
  access: string;
  country_code: string | null;
  population: string;
  publication_year: number | null;
  retrieved_at: string;
  verification_state: string;
  reuse_mode: string;
  steps: string[];
  evidence: Record<string, unknown>;
};
export const learningResources = snapshot.records as LearningResource[];
export const destinationGuides = learningResources.filter(
  (r) => r.kind === "destination",
);
export function latestResources(rows: LearningResource[]) {
  const latest = new Map<string, LearningResource>();
  for (const row of rows) {
    if (
      row.verification_state !== "verified" ||
      row.reuse_mode !== "link_metadata_only" ||
      !Number.isFinite(Date.parse(row.retrieved_at))
    )
      continue;
    const previous = latest.get(row.slug);
    if (
      !previous ||
      Date.parse(row.retrieved_at) > Date.parse(previous.retrieved_at)
    )
      latest.set(row.slug, row);
  }
  return [...latest.values()];
}
export type ApplicationRehearsal = {
  destination: string;
  university: string;
  program: string;
  qualification: string;
  intake: string;
  completed: string[];
};
/** This checks the preparation steps the student confirmed, never admission chances. */
export function rehearsalTasks(
  draft: ApplicationRehearsal,
  guide: LearningResource,
) {
  const context =
    [draft.university.trim(), draft.program.trim(), draft.intake.trim()]
      .filter(Boolean)
      .join(" · ") || guide.title;
  return guide.steps.map((step, index) => ({
    title: `${context}: ${step}`,
    done: draft.completed.includes(String(index)),
  }));
}
