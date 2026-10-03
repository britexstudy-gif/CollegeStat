import type { Cost } from "./domain";
export const profileNavigation = [
  { id: "Overview", label: "Overview", categories: ["Overview"] },
  { id: "Admissions", label: "How to apply", categories: ["Admissions"] },
  { id: "Academics", label: "Programs", categories: ["Academics"] },
  {
    id: "Costs",
    label: "Costs & funding",
    categories: ["Costs", "Financial Aid"],
  },
  { id: "Rankings", label: "Rankings", categories: [] },
  { id: "Research", label: "Research & people", categories: ["Research"] },
  {
    id: "Campus",
    label: "Campus & students",
    categories: ["Students", "Outcomes"],
  },
  { id: "Gallery", label: "Gallery", categories: [] },
  { id: "Sources", label: "Sources", categories: [] },
] as const;
export type ProfileSection = (typeof profileNavigation)[number]["id"];
const aliases: Record<string, ProfileSection> = {
  "How to apply": "Admissions",
  Deadlines: "Admissions",
  Programs: "Academics",
  Courses: "Academics",
  Scholarships: "Costs",
  "Financial Aid": "Costs",
  People: "Research",
  Students: "Campus",
  Outcomes: "Campus",
};
export function profileSection(value: string | null): ProfileSection {
  return (
    profileNavigation.find((s) => s.id === value)?.id ||
    aliases[value || ""] ||
    "Overview"
  );
}
/** Keep the latest year for each cost/population/currency, without erasing older-only categories. */
export function latestReportedCosts(rows: Cost[]): Cost[] {
  const groups = new Map<string, Cost[]>();
  for (const row of rows) {
    const key = JSON.stringify([
      row.category,
      row.student_category,
      row.currency,
      row.period,
      row.program_id,
    ]);
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return [...groups.values()].flatMap((group) => {
    const years = group.flatMap((r) => (r.year == null ? [] : [r.year]));
    const latest = years.length ? Math.max(...years) : null;
    return group.filter((r) => r.year === latest);
  });
}
