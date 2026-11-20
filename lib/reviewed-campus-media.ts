import reviewed from "@/data/published/reviewed-campus-media-oct10.json";
import existing from "@/data/published/reviewed-scholarship-campus-media.json";
import type { Media } from "./domain";

/** Reviewed display derivatives use exact institution IDs and retained file receipts. */
export const reviewedCampusMedia = [
  ...reviewed.records,
  ...existing.records,
].map(
  (record) =>
    ({
      ...record,
      id: `display-campus-${record.university_id}`,
      kind: "campus",
      verification_status: "verified",
      year: null,
      source_id: null,
      professor_id: null,
      verified_at:
        "verified_at" in record ? record.verified_at : record.retrieved_at,
      notes: record.scope,
      evidence: {
        ...record.evidence,
        retrieved_at: record.retrieved_at,
        reporting_period: record.capture_date,
        source_record_id: record.source_record_id,
      },
    }) as Media,
);

export function withReviewedCampusMedia(
  id: string | undefined,
  published: Media[],
): Media[] {
  if (!id) return published;
  const sources = new Set(published.map((r) => r.source_url));
  const urls = new Set(published.map((r) => r.url));
  const supplementary = reviewedCampusMedia.filter(
    (r) =>
      r.university_id === id && !sources.has(r.source_url) && !urls.has(r.url),
  );
  return [...published, ...supplementary];
}
