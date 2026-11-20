import type { ResearchMetric } from "./domain";

const countMetrics = new Set([
  "indexed_works",
  "indexed_citations",
  "yearly_indexed_works",
  "yearly_open_access_works",
  "yearly_citation_rollup",
  "topic_indexed_works",
]);

function verifiedResearchMetrics(records: ResearchMetric[]) {
  return records.filter((record) => {
    if (
      record.verification_status !== "verified" ||
      !countMetrics.has(record.metric) ||
      !Number.isSafeInteger(record.value) ||
      record.value < 0 ||
      !Number.isFinite(Date.parse(record.retrieved_at))
    )
      return false;
    try {
      return new URL(record.source_url).protocol === "https:";
    } catch {
      return false;
    }
  });
}

/** Select a display snapshot without changing or discarding stored history. */
export function latestResearchMetrics(records: ResearchMetric[]) {
  const latest = new Map<string, ResearchMetric>();
  for (const record of verifiedResearchMetrics(records)) {
    const key = JSON.stringify([
      record.university_id,
      record.metric,
      record.period,
      record.field,
    ]);
    const current = latest.get(key);
    if (
      !current ||
      (record.edition || "").localeCompare(current.edition || "") > 0 ||
      (record.edition === current.edition &&
        Date.parse(record.retrieved_at) > Date.parse(current.retrieved_at))
    )
      latest.set(key, record);
  }
  return [...latest.values()];
}

export type ResearchYear = {
  year: number;
  works?: ResearchMetric;
  openAccess?: ResearchMetric;
  citationRollup?: ResearchMetric;
  partial: boolean;
};

/** Annual series for the single institution selected by the profile page. */
export function researchYears(records: ResearchMetric[]): ResearchYear[] {
  const years = new Map<number, ResearchYear>();
  for (const record of latestResearchMetrics(records)) {
    if (record.field || !/^\d{4}$/.test(record.period)) continue;
    const year = Number(record.period);
    const retrievedYear = new Date(record.retrieved_at).getUTCFullYear();
    if (year < 1900 || year > retrievedYear) continue;
    const field =
      record.metric === "yearly_indexed_works"
        ? "works"
        : record.metric === "yearly_open_access_works"
          ? "openAccess"
          : record.metric === "yearly_citation_rollup"
            ? "citationRollup"
            : null;
    if (!field) continue;
    const row = years.get(year) || { year, partial: false };
    row[field] = record;
    row.partial ||= year === retrievedYear;
    years.set(year, row);
  }
  return [...years.values()].sort((a, b) => a.year - b.year);
}

/** Topics from one provider snapshot; never mix old and new topic lists. */
export function latestResearchTopics(records: ResearchMetric[]) {
  const topics = latestResearchMetrics(records).filter(
    (record) => record.metric === "topic_indexed_works" && record.field,
  );
  const newest = topics.reduce<ResearchMetric | undefined>((best, record) => {
    if (!best) return record;
    const edition = (record.edition || "").localeCompare(best.edition || "");
    return edition > 0 ||
      (edition === 0 &&
        Date.parse(record.retrieved_at) > Date.parse(best.retrieved_at))
      ? record
      : best;
  }, undefined);
  return topics
    .filter(
      (record) =>
        record.period === newest?.period && record.edition === newest?.edition,
    )
    .sort(
      (a, b) =>
        b.value - a.value || (a.field || "").localeCompare(b.field || ""),
    );
}
