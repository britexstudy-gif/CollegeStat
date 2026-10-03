import type { University } from "./domain";
import { normalizeSearch } from "./search-text";

export type ProgramListing = {
  id: string;
  name: string;
  level: string;
  qualification: string;
  origin: "official" | "reported";
  url?: string;
  sourceURL?: string;
  checked?: string;
  year?: number;
  completions?: number;
};
export function degreeLabel(value: string) {
  if (/certificate|diploma/i.test(value)) return "Certificate / diploma";
  if (/bachelor|baccalaureate/i.test(value)) return "Bachelor’s";
  if (/master/i.test(value)) return "Master’s";
  if (/doctor|phd/i.test(value)) return "Doctoral";
  if (/associate/i.test(value)) return "Associate";
  return value || "Level not supplied";
}
export function programListings(
  u: Pick<University, "university_programs" | "reported_programs">,
): ProgramListing[] {
  return [
    ...u.university_programs.map((r) => ({
      id: "official:" + r.programs.id,
      name: r.programs.name,
      level: degreeLabel(r.programs.degree_level),
      qualification: r.programs.degree_level,
      origin: "official" as const,
      url: r.source_url || r.data_sources?.url,
      checked: r.verified_at?.slice(0, 10),
    })),
    ...(u.reported_programs || []).map((r) => ({
      id: "reported:" + r.cip + ":" + r.award,
      name: r.name,
      level: degreeLabel(r.level),
      qualification: r.award,
      origin: "reported" as const,
      year: r.year,
      completions: r.completions,
      sourceURL: "https://nces.ed.gov/ipeds/complete-data-files/C2025_A.zip",
    })),
  ];
}
export function programLetter(name: string) {
  const first = normalizeSearch(name).charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : "#";
}
export function discoverPrograms(
  rows: ProgramListing[],
  filters: {
    query: string;
    degree: string;
    origin: string;
    letter: string;
  },
) {
  const words = normalizeSearch(filters.query).split(" ").filter(Boolean);
  return rows
    .filter((r) => {
      const text = normalizeSearch(r.name + " " + r.qualification);
      return (
        (!filters.degree || r.level === filters.degree) &&
        (!filters.origin || r.origin === filters.origin) &&
        (!filters.letter || programLetter(r.name) === filters.letter) &&
        words.every((word) => text.includes(word))
      );
    })
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name, "en", {
          numeric: true,
          sensitivity: "base",
        }) ||
        a.level.localeCompare(b.level) ||
        a.id.localeCompare(b.id),
    );
}
