/** Read-only datasets the Worker serves from static assets instead of its
 * bundle (Workers cap the bundle at 3 MB free / 10 MB paid, compressed).
 *
 * `scripts/build-asset-data.ts` writes them to dist/client/data/ after the
 * build; `server/asset-data.ts` reads them. Paths are relative to data/. */

/** Whole files copied as they are. A directory entry copies every .json in it. */
export const ASSET_FILES = [
  "generated/catalogue/featured.json",
  "published/wikidata-facts-nov14-shards/",
  "published/ranking-all.json",
  "published/ranking-profile-index.json",
  "published/reviewed-national-rankings.json",
  "generated/ranking-profiles.json",
  "generated/directory-ranking-rows.json",
] as const;

/** Files read one record at a time: written as one small file per id bucket. */
export const KEYED_DATASETS = {
  "published/ipeds-us-stats-2023.json": (d: { records: Record<string, unknown> }) => d.records,
  "published/college-scorecard.json": (d: { records: Record<string, unknown> }) => d.records,
  // College Scorecard 2025/26 (Most-Recent-Cohorts, file dated 2026-11-02), staged by the data run; an array keyed here by id.
  "review/scorecard-2026-11.json": (d: { records: { id: string }[] }) => Object.fromEntries(d.records.map((r) => [r.id, r])),
} as const;
export type KeyedDataset = keyof typeof KEYED_DATASETS;

/** Bucket for a university id (a UUID): its first hex digit, 16 files per dataset. */
export const bucketOf = (id: string) => id.charAt(0).toLowerCase();

/** Where one id bucket of a keyed dataset is published, below data/. */
export const bucketPath = (dataset: string, bucket: string) => dataset.replace(/\.json$/, "") + "/" + bucket + ".json";
