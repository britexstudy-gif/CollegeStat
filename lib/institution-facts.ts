import type { University } from "./domain";

/** Institution type as the profile reports it: the catalogue's own type first,
 * then the reviewed history card's public/private/other. Null when neither exists. */
export function institutionType(u: Pick<University, "university_type" | "history">): string | null {
  const catalogue = u.university_type?.trim();
  if (catalogue) return catalogue;
  const reviewed = u.history?.type;
  return reviewed ? (reviewed === "other" ? "Other" : reviewed[0].toUpperCase() + reviewed.slice(1)) : null;
}

/** Founding year in the profile's order: the reviewed year its Established row
 * shows, then the catalogue year, then the history card's year. */
export function establishedYear(
  u: Pick<University, "reviewed_identity" | "founded_year" | "history">,
): number | null {
  return u.reviewed_identity?.founded_year ?? u.founded_year ?? u.history?.founded_year ?? null;
}
