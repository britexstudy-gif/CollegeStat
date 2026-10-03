import type { ImportedRecord } from "./domain";

export const PROFILE_CURRENT_YEAR = 2025;
export const profileCategories = [
  "Overview",
  "Admissions",
  "Costs",
  "Students",
  "Academics",
  "Research",
  "Outcomes",
  "Financial Aid",
] as const;
export type ProfileCategory = (typeof profileCategories)[number];

export function recordCategory(record: ImportedRecord): ProfileCategory {
  const m = record.metric.toLowerCase();
  if (["ror", "wikidata", "hipo"].includes(record.source)) return "Overview";
  if (/tuition|fee|room|board|housing|food_on_campus|cost|net_price/.test(m))
    return "Costs";
  if (/pell|grant|scholarship|financial_aid|debt/.test(m))
    return "Financial Aid";
  if (/admi|accept|applicant|sat_|act_|ielts|toefl/.test(m))
    return "Admissions";
  if (/enroll|student|nonresident/.test(m)) return "Students";
  if (/completions_cip|program_percentage/.test(m)) return "Academics";
  if (/graduat|completion|earning|salary/.test(m)) return "Outcomes";
  if (["leiden", "openalex"].includes(record.source)) return "Research";
  return "Overview";
}

export function recordsForCategory(
  records: ImportedRecord[],
  category: string,
) {
  return records.filter(
    (r) =>
      r.publication_status === "published" &&
      r.verification_status === "verified" &&
      recordCategory(r) === category,
  );
}

// Retrieval dates describe provenance, never the age of an observation.
export function isCurrentObservation(record: ImportedRecord) {
  return (
    record.reporting_year != null &&
    record.reporting_year >= PROFILE_CURRENT_YEAR
  );
}

export function historicalSeries(records: ImportedRecord[]) {
  const groups = new Map<string, ImportedRecord[]>();
  for (const r of records) {
    if (typeof r.value !== "number" || r.reporting_year == null) continue;
    // Different sources, units and populations cannot silently form one trend.
    const key = [r.source, r.metric, r.unit, r.cohort].join("|");
    const group = groups.get(key) || [];
    if (!group.some((v) => v.reporting_year === r.reporting_year))
      group.push(r);
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((g) => g.some((r) => !isCurrentObservation(r)))
    .map((g) => g.sort((a, b) => a.reporting_year! - b.reporting_year!));
}
