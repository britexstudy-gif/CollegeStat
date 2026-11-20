import manifest from "@/data/published/reviewed-scholarship-campus-media.json";
import type { Media } from "./domain";

/** Exactly reconciled institution IDs; display derivatives preserve source and licence. */
export const scholarshipCampusMedia = new Map<string, Media>(
  manifest.records.map((record) => [record.university_id, {
    ...record,
    id: `display-campus-${record.university_id}`,
    kind: "campus",
    verification_status: "verified",
    year: null,
    source_id: null,
    professor_id: null,
    verified_at: record.retrieved_at,
    notes: record.scope,
    evidence: { ...record.evidence, retrieved_at: record.retrieved_at, reporting_period: record.capture_date, source_record_id: record.source_record_id },
  }]),
);
