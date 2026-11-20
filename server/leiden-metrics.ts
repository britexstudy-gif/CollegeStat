import receiptJSON from "@/data/published/reviewed-leiden-expansion.json";
import type { ResearchMetric } from "@/lib/domain";

type LeidenReceipt = {
  reviewed_at: string;
  context: { publication_period: string; field: string; citation_window_end: number; counting_method: string; core_publications_only: boolean; minimum_publications_filter: number };
  evidence: { indicators: { retrieved_at: string; sha256: string }; identity_crosswalk: { sha256: string }; definitions_url: string };
  mappings: Record<string, { metric: string; unit: string; definition: string }>;
  records: { university_id: string; source_record_id: string; source_url: string; ror: string; values: Record<string, { id: string; value: number }> }[];
};

const receipt = receiptJSON as LeidenReceipt;
const byUniversity = new Map<string, ResearchMetric[]>();
for (const institution of receipt.records) {
  byUniversity.set(institution.university_id, Object.entries(institution.values).map(([field, datum]) => ({
    id: datum.id,
    university_id: institution.university_id,
    metric: receipt.mappings[field].metric,
    value: datum.value,
    unit: receipt.mappings[field].unit,
    period: receipt.context.publication_period,
    field: receipt.context.field,
    edition: "Leiden Open Edition 2025",
    source_url: institution.source_url,
    retrieved_at: receipt.evidence.indicators.retrieved_at,
    last_verified_at: receipt.reviewed_at + "T00:00:00Z",
    verification_status: "verified",
    notes: receipt.mappings[field].definition,
    evidence: {
      scope: "Leiden Open Edition 2025 scientific impact",
      reporting_period: receipt.context.publication_period,
      publication_year: 2025,
      source_record_id: institution.source_record_id,
      ror_id: institution.ror,
      raw_field: field,
      counting_method: receipt.context.counting_method,
      core_publications_only: receipt.context.core_publications_only,
      citation_window_end: receipt.context.citation_window_end,
      minimum_publications_filter: receipt.context.minimum_publications_filter,
      dataset_sha256: receipt.evidence.indicators.sha256,
      crosswalk_sha256: receipt.evidence.identity_crosswalk.sha256,
      indicator_definition_url: receipt.evidence.definitions_url,
      license_note: "CC0-1.0",
    },
  })));
}

/** Exact-ID scientific-impact values; provider ordering is never a quality rank. */
export function institutionLeidenMetrics(id: string): ResearchMetric[] {
  return byUniversity.get(id) || [];
}
