import type { Media, University } from "./domain";
import type { UniversityEnrichment } from "./university-enrichment";

/** Only licensed campus photographs. A logo or a bibliography image is not a campus photo. */
export function campusGallery(rows: Media[]): Media[] {
  const urls = new Set<string>();
  return rows.filter((row) => {
    if (
      row.kind !== "campus" ||
      row.verification_status !== "verified" ||
      !row.reuse_permitted ||
      !row.url ||
      !row.source_url ||
      !row.license ||
      urls.has(row.url)
    )
      return false;
    urls.add(row.url);
    return true;
  });
}

/** The rendered gallery and its summary share the same reviewed photograph set. */
export function profileCampusGallery(
  u: Pick<University, "id" | "media">,
  enrichment?: Pick<UniversityEnrichment, "gallery">,
): Media[] {
  const extra: Media[] = (enrichment?.gallery || []).map((photo) => ({
    ...photo,
    id: `reviewed-gallery:${u.id}:${photo.url}`,
    university_id: u.id,
    professor_id: null,
    kind: "campus",
    source_id: null,
    year: null,
    verified_at: photo.checked_at,
    notes: null,
    width: null,
    height: null,
  }));
  return campusGallery([...u.media, ...extra]);
}
