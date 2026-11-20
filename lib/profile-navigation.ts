import type { Cost } from "./domain";
export const profileNavigation = [
  { id: "Overview", label: "Overview", categories: ["Overview"] },
  { id: "Admissions", label: "Apply", categories: ["Admissions"] },
  { id: "Academics", label: "Study", categories: ["Academics", "Research"] },
  {
    id: "Costs",
    label: "Costs & funding",
    categories: ["Costs", "Financial Aid"],
  },
  { id: "Rankings", label: "Rankings", categories: [] },
  { id: "Campus", label: "Campus & media", categories: [] },
  { id: "People", label: "People & stories", categories: [] },
  { id: "Sources", label: "Evidence", categories: ["Students", "Outcomes"] },
] as const;
export type ProfileSection = (typeof profileNavigation)[number]["id"];
const aliases: Record<string, ProfileSection> = {
  "How to apply": "Admissions",
  Apply: "Admissions",
  Deadlines: "Admissions",
  Programs: "Academics",
  Courses: "Academics",
  Study: "Academics",
  Scholarships: "Costs",
  "Financial Aid": "Costs",
  Research: "Academics",
  Gallery: "Overview",
  Students: "Sources",
  Outcomes: "Sources",
  Evidence: "Sources",
};
export type ProfileView =
  "summary" | "campus" | "gallery" | "programs" | "research";
/** Legacy bookmarks select the same content within the smaller primary navigation. */
export function profileView(
  tab: string | null,
  view: string | null,
): ProfileView {
  const section = profileSection(tab);
  if (section === "Campus") return "campus";
  if (section === "Overview") {
    if (view === "gallery" || tab === "Gallery") return "gallery";
    if (view === "campus" || tab === "Campus") return "campus";
    return "summary";
  }
  if (section === "Academics")
    return view === "research" || ["Research", "People"].includes(tab || "")
      ? "research"
      : "programs";
  return "summary";
}
export function profileSection(value: string | null): ProfileSection {
  return (
    profileNavigation.find((s) => s.id === value)?.id ||
    aliases[value || ""] ||
    "Overview"
  );
}
/** Keep latest dated costs and undated costs within each stated scope and population. */
export function latestReportedCosts(rows: Cost[]): Cost[] {
  const groups = new Map<string, Cost[]>();
  for (const row of rows) {
    const key = JSON.stringify([
      row.category,
      row.student_category,
      row.currency,
      row.period,
      row.program_id,
      row.evidence?.scope || null,
      row.evidence?.population || null,
    ]);
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return [...groups.values()].flatMap((group) => {
    const years = group.flatMap((r) => (r.year == null ? [] : [r.year]));
    const latest = years.length ? Math.max(...years) : null;
    return group.filter((r) => r.year == null || r.year === latest);
  });
}
