import type {
  ApplicationRehearsal,
  LearningResource,
} from "./learning-resources";

export type AdmissionPlannerSection =
  "practice" | "destinations" | "application";
/** An explicit practice link stays valid; admissions guidance is the default. */
export function admissionPlannerSection(
  value: unknown,
): AdmissionPlannerSection {
  return value === "application" ||
    value === "practice" ||
    value === "destinations"
    ? value
    : "destinations";
}
export function admissionPlannerHref(
  current: string,
  section: AdmissionPlannerSection,
) {
  const url = new URL(current, "https://college.example");
  url.searchParams.set("section", section);
  return url.pathname + url.search + url.hash;
}
/** Legacy unowned progress is deliberately not adopted into a signed-in account. */
export function guideProgressKey(owner: string | null, guideId: string) {
  return `collegestat-guide:v2:${owner || "anonymous"}:${guideId}`;
}
export function checkedGuideSteps(
  raw: string | null,
  known: readonly string[],
) {
  if (!raw || raw.length > 16384) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value) || value.length > 100) return [];
    const wanted = new Set(
      value.filter((step): step is string => typeof step === "string"),
    );
    return known.filter((step) => wanted.has(step));
  } catch {
    return [];
  }
}
function text(
  value: unknown,
  limit: number,
  allowEmpty = false,
): value is string {
  return (
    typeof value === "string" &&
    value.length <= limit &&
    (allowEmpty || value.trim().length > 0)
  );
}
function safeSourceUrl(value: unknown) {
  if (!text(value, 2048)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
/** A malformed refresh is held as a whole; the installed checked catalogue remains usable. */
export function reviewedLearningResources(value: unknown): LearningResource[] {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("The resource update could not be verified.");
  const rows = (value as Record<string, unknown>).resources;
  if (!Array.isArray(rows) || !rows.length || rows.length > 100)
    throw new Error(
      "The resource update did not contain a complete checked catalogue.",
    );
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row))
      throw new Error("The resource update could not be verified.");
    const r = row as Record<string, unknown>;
    if (
      !text(r.id, 100) ||
      ids.has(r.id) ||
      !text(r.slug, 200) ||
      !/^[a-z0-9-]+$/.test(r.slug) ||
      !text(r.title, 300) ||
      !text(r.provider, 200) ||
      !text(r.subject, 100) ||
      (r.kind !== "practice" && r.kind !== "destination") ||
      !safeSourceUrl(r.url) ||
      !text(r.summary, 5000) ||
      !text(r.access, 1000) ||
      !text(r.population, 2000) ||
      (r.country_code !== null &&
        (!text(r.country_code, 2) || !/^[A-Z]{2}$/.test(r.country_code))) ||
      (r.publication_year !== null &&
        (!Number.isInteger(r.publication_year) ||
          Number(r.publication_year) < 1900 ||
          Number(r.publication_year) > 2100)) ||
      !text(r.retrieved_at, 64) ||
      !Number.isFinite(Date.parse(r.retrieved_at)) ||
      r.verification_state !== "verified" ||
      r.reuse_mode !== "link_metadata_only" ||
      !Array.isArray(r.steps) ||
      r.steps.length > 20 ||
      r.steps.some((step) => !text(step, 1000)) ||
      !r.evidence ||
      typeof r.evidence !== "object" ||
      Array.isArray(r.evidence)
    )
      throw new Error("The resource update could not be verified.");
    const evidence = r.evidence as Record<string, unknown>;
    if (
      evidence.source_url !== r.url ||
      evidence.provider !== r.provider ||
      evidence.retrieved_at !== r.retrieved_at ||
      evidence.scope !== r.population ||
      evidence.publication_year !== r.publication_year ||
      evidence.content_imported !== false ||
      evidence.question_count !== null ||
      !text(evidence.verification_method, 2000) ||
      !safeSourceUrl(evidence.rights_url)
    )
      throw new Error(
        "The resource update's source evidence could not be verified.",
      );
    ids.add(r.id);
  }
  return rows as LearningResource[];
}

const rehearsalSessionPrefix = "collegestat-rehearsal:v1:";
const rehearsalOwnerKey = rehearsalSessionPrefix + "current-owner";
type SessionStore = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem" | "key" | "length"
>;
/** Account changes clear tab-session drafts; route remounts for the same owner do not. */
export function prepareRehearsalOwner(
  storage: SessionStore,
  owner: string | null,
) {
  const identity = owner || "anonymous";
  if (storage.getItem(rehearsalOwnerKey) !== identity) {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(rehearsalSessionPrefix)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
    storage.setItem(rehearsalOwnerKey, identity);
  }
  return rehearsalSessionPrefix + identity;
}
export function decodeRehearsalSession(
  raw: string | null,
  resources: readonly LearningResource[],
): ApplicationRehearsal | null {
  if (!raw || raw.length > 16384) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value))
      return null;
    const envelope = value as Record<string, unknown>,
      draft = envelope.draft;
    if (!draft || typeof draft !== "object" || Array.isArray(draft))
      return null;
    const d = draft as Record<string, unknown>;
    if (!text(d.destination, 200)) return null;
    const guide = resources.find(
      (r) => r.kind === "destination" && r.slug === d.destination,
    );
    if (
      !guide ||
      !text(d.university, 60, true) ||
      !text(d.program, 60, true) ||
      !text(d.qualification, 120, true) ||
      !text(d.intake, 24, true) ||
      !Array.isArray(d.completed) ||
      d.completed.length > 20 ||
      d.completed.some(
        (step) => typeof step !== "string" || !/^(?:[0-9]|1[0-9])$/.test(step),
      )
    )
      return null;
    const sameSteps =
      JSON.stringify(envelope.source_steps) === JSON.stringify(guide.steps);
    return {
      destination: d.destination,
      university: d.university,
      program: d.program,
      qualification: d.qualification,
      intake: d.intake,
      completed: sameSteps
        ? [...new Set(d.completed as string[])].filter(
            (step) => Number(step) < guide.steps.length,
          )
        : [],
    };
  } catch {
    return null;
  }
}
