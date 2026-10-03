import type { Media } from "./domain";

/** Only licensed campus photographs. A logo or a bibliography image is not a campus photo. */
export function campusGallery(rows: Media[]): Media[] {
  const urls = new Set<string>();
  return rows.filter((row) => {
    if (row.kind !== "campus" || row.verification_status !== "verified" ||
      !row.reuse_permitted || !row.url || !row.source_url || !row.license || urls.has(row.url)) return false;
    urls.add(row.url);
    return true;
  });
}
