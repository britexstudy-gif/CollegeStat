/** A discreet entry point, never an authorization mechanism. APIs and RLS check the staff role. */
export const STAFF_PATH = "/staff/college-console";
export const STAFF_SIGN_IN = STAFF_PATH + "/sign-in";
export const staffSections = [
  "overview",
  "activity",
  "coverage",
  "mcp",
  "security",
  "structure",
  "universities",
  "programs",
  "rankings",
  "scholarships",
  "connections",
  "sources",
  "imports",
  "review",
  "inbox",
  "users",
  "reports",
  "settings",
  "departments",
  "faculty",
  "research",
  "deadlines",
  "requirements",
  "aid",
  "media",
  "feeds",
  "jobs",
  "identifiers",
  "candidates",
  "stale",
] as const;
export function isStaffPath(path: string | null) {
  return path === STAFF_PATH || !!path?.startsWith(STAFF_PATH + "/");
}
