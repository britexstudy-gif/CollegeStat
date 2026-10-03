import type { Scholarship } from "./domain";
export function scholarshipDeadline(
  award: Scholarship,
  today: string,
): "closed" | "upcoming" | "unknown" {
  if (!award.deadline || !/^\d{4}-\d{2}-\d{2}$/.test(award.deadline))
    return "unknown";
  const parsed = new Date(award.deadline);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== award.deadline
  )
    return "unknown";
  return award.deadline < today ? "closed" : "upcoming";
}
export function filterScholarships(
  rows: Scholarship[],
  filters: {
    query: string;
    funding: string;
    level: string;
    includeClosed: boolean;
    slug?: string;
    university?: string;
    today: string;
  },
) {
  const query = filters.query.toLowerCase().trim();
  return rows
    .filter(
      (a) =>
        a.published &&
        a.verification_status === "verified" &&
        (!filters.slug || a.slug === filters.slug) &&
        (!filters.university || a.university_scholarships.some(link => link.university_id === filters.university)) &&
        (!query ||
          (a.name + " " + (a.description || ""))
            .toLowerCase()
            .includes(query)) &&
        (filters.funding === "all" || a.funding_type === filters.funding) &&
        (filters.level === "all" || a.level === filters.level) &&
        (filters.includeClosed ||
          scholarshipDeadline(a, filters.today) !== "closed"),
    )
    .sort(
      (a, b) =>
        (a.deadline || "9999").localeCompare(b.deadline || "9999") ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
}
