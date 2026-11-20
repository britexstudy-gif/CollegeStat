import type { University } from "./domain";
import type { UniversityEnrichment } from "./university-enrichment";
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
  durationMonths?: number | null;
  duration?: string;
  scope?: string;
  intakes?: string[];
  language?: string | null;
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
  reviewedProgrammes: UniversityEnrichment["programmes"] = [],
): ProgramListing[] {
  const official: ProgramListing[] = u.university_programs
    .filter(
      (r) =>
        r.verification_status === "verified" && r.source_id && r.verified_at,
    )
    .map((r) => ({
      id: "official:" + r.programs.id,
      name: r.programs.name,
      level: degreeLabel(r.programs.degree_level),
      qualification:
        typeof r.evidence?.qualification === "string"
          ? r.evidence.qualification
          : r.programs.degree_level,
      origin: "official" as const,
      url: r.source_url || r.data_sources?.url,
      checked: r.verified_at?.slice(0, 10),
      year: r.year ?? undefined,
      durationMonths: r.duration_months,
      intakes: r.intakes,
      language: r.programs.language,
      scope:
        typeof r.evidence?.scope === "string"
          ? r.evidence.scope
          : typeof r.evidence?.population === "string"
            ? r.evidence.population
            : undefined,
    }));
  const reviewed: ProgramListing[] = reviewedProgrammes
    .filter(
      (p) => p.verification_status === "verified" && p.checked_at && p.url,
    )
    .map((p) => ({
      id: "reviewed:" + p.url + ":" + normalizeSearch(p.name + " " + p.level),
      name: p.name,
      level: degreeLabel(p.level),
      qualification: p.level,
      origin: "official",
      url: p.url,
      sourceURL: p.source_url !== p.url ? p.source_url : undefined,
      checked: p.checked_at,
      duration: p.duration,
      scope: p.scope,
    }));

  // Shared catalogue URLs are evidence, not a unique course identity. Distinct
  // named courses on the same directory page must survive URL deduplication.
  const sharedURLs = new Set<string>();
  for (const source of [official, reviewed]) {
    const namesByURL = new Map<string, Set<string>>();
    for (const p of source) {
      if (!p.url) continue;
      const names = namesByURL.get(p.url) || new Set<string>();
      names.add(normalizeSearch(p.name));
      namesByURL.set(p.url, names);
    }
    for (const [url, names] of namesByURL)
      if (names.size > 1) sharedURLs.add(url);
  }
  const merged: ProgramListing[] = [];
  const byNameLevel = new Map<string, number>();
  const byURL = new Map<string, number>();
  for (const p of [...official, ...reviewed]) {
    const nameLevel = normalizeSearch(p.name) + ":" + normalizeSearch(p.level);
    const match =
      byNameLevel.get(nameLevel) ??
      (p.url && !sharedURLs.has(p.url) ? byURL.get(p.url) : undefined);
    if (match === undefined) {
      merged.push(p);
      byNameLevel.set(nameLevel, merged.length - 1);
      if (p.url && !sharedURLs.has(p.url)) byURL.set(p.url, merged.length - 1);
      continue;
    }
    const previous = merged[match];
    // Prefer the existing structured offer, filling only missing details from
    // its reviewed counterpart. Never infer an intake, year or duration.
    merged[match] = {
      ...p,
      ...previous,
      url: previous.url || p.url,
      sourceURL: previous.sourceURL || p.sourceURL,
      checked: previous.checked || p.checked,
      year: previous.year ?? p.year,
      durationMonths:
        previous.durationMonths ?? p.durationMonths ?? previous.durationMonths,
      duration: previous.duration || p.duration,
      scope: previous.scope || p.scope,
      intakes: previous.intakes?.length ? previous.intakes : p.intakes,
      language: previous.language ?? p.language ?? previous.language,
    };
    byNameLevel.set(nameLevel, match);
    if (p.url && !sharedURLs.has(p.url)) byURL.set(p.url, match);
  }
  return [
    ...merged,
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
