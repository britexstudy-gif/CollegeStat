import type { Sourced, University } from "./domain";
import { sourceObservationLabel } from "./source-observation-label";
import { metricDefinitions } from "./research";
import { normalizeSearch } from "./search-text";

export type EvidenceGroup =
  | "Study"
  | "Apply"
  | "Costs & funding"
  | "Rankings"
  | "Research"
  | "Students & outcomes"
  | "Campus & identity";
export type UniversityEvidence = {
  key: string;
  group: EvidenceGroup;
  label: string;
  period: string;
  population: string;
  source: string;
  record: Sourced;
};

function readableObservation(value: string): string {
  return (
    metricDefinitions.find((metric) => metric.key === value)?.label ||
    value.replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase())
  );
}

/** Keep every historical observation. Grouping changes presentation, never values. */
export function universityEvidence(u: University): UniversityEvidence[] {
  const rows: UniversityEvidence[] = [];
  function add(
    group: EvidenceGroup,
    record: Sourced,
    label: string,
    period?: string,
  ) {
    rows.push({
      key: `${group}:${record.id}:${rows.length}`,
      group,
      label: readableObservation(label),
      period:
        period ||
        record.evidence?.reporting_period ||
        (record.year != null ? String(record.year) : "Year not stated"),
      population:
        [record.evidence?.scope, record.evidence?.population]
          .filter((value, i, values) => value && values.indexOf(value) === i)
          .join(" · ") || "Scope not stated",
      source:
        record.data_sources?.name ||
        (record.source_url ? "Linked source" : "Source pending"),
      record,
    });
  }
  u.university_programs.forEach((offer, index) =>
    add(
      "Study",
      {
        ...offer,
        id: offer.id || `${offer.programs.id}:${index}`,
        year: offer.year ?? offer.reporting_year ?? null,
        source_id: offer.source_id ?? null,
        verification_status: offer.verification_status ?? "needs_review",
        verified_at: offer.verified_at ?? null,
        notes: offer.notes ?? null,
      },
      offer.programs.name,
    ),
  );
  u.admissions.forEach((row) => add("Apply", row, "Admissions statistics"));
  u.requirements.forEach((row) => add("Apply", row, row.label));
  u.deadlines.forEach((row) =>
    add("Apply", row, row.title, row.cycle || undefined),
  );
  u.costs.forEach((row) => add("Costs & funding", row, row.category));
  u.financial_aid.forEach((row) => add("Costs & funding", row, row.name));
  u.ranking_entries.forEach((row) =>
    add(
      "Rankings",
      row,
      [
        row.ranking_editions?.ranking_providers?.name || "Ranking",
        row.ranking_editions?.subject,
        row.ranking_editions?.region,
      ]
        .filter(Boolean)
        .join(" · "),
      row.ranking_editions?.year
        ? `${row.ranking_editions.year} edition`
        : undefined,
    ),
  );
  u.departments.forEach((row) => add("Research", row, row.name));
  u.professors.forEach((row) => add("Research", row, row.name));
  u.research.forEach((row) => add("Research", row, row.title));
  (u.research_metrics || []).forEach((row) =>
    add(
      "Research",
      {
        ...row,
        year: null,
        source_id: row.source_id || null,
        verified_at: row.last_verified_at || null,
        notes: row.notes || null,
        evidence: {
          ...row.evidence,
          retrieved_at: row.retrieved_at,
          reporting_period: row.period,
        },
      },
      row.metric,
      row.period,
    ),
  );
  u.data_points.forEach((row) => {
    const definition = metricDefinitions.find(
      (metric) => metric.key === row.metric,
    );
    const group: EvidenceGroup =
      definition?.group === "Financial aid" ||
      /tuition|cost|fee|net_price/.test(row.metric)
        ? "Costs & funding"
        : "Students & outcomes";
    add(group, row, sourceObservationLabel(row));
  });
  u.media.forEach((row) =>
    add("Campus & identity", row, sourceObservationLabel(row)),
  );
  return rows;
}

export function filterUniversityEvidence(
  rows: UniversityEvidence[],
  query: string,
  group: string,
): UniversityEvidence[] {
  const words = normalizeSearch(query).split(" ").filter(Boolean);
  return rows.filter(
    (row) =>
      (!group || row.group === group) &&
      words.every((word) =>
        normalizeSearch(
          [
            row.label,
            row.source,
            row.period,
            row.population,
            row.record.verification_status,
          ].join(" "),
        ).includes(word),
      ),
  );
}
