import type { University } from "@/lib/domain";

/** Profiles are split into this many files so a profile page only parses one. */
export const SHARD_COUNT = 64;

/** Stable FNV-1a bucket for a slug; shared by the build script and the server. */
export function shardOf(slug: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < slug.length; i++) h = Math.imul(h ^ slug.charCodeAt(i), 0x01000193);
  return (h >>> 0) % SHARD_COUNT;
}

/** Search, explore and ranking lists need identity, filters and card fields,
 * not the research profile. Program lists keep only what filters match on;
 * imported records and metrics keep only Leiden, which the ranking table reads. */
export function listRow(u: University): University {
  const {
    research_identity: _ri,
    official_web: _ow,
    social_links: _sl,
    description: _d,
    profile_resources: _pr,
    ...rest
  } = u as University & Record<string, unknown>;
  return {
    ...rest,
    reported_programs: u.reported_programs?.map((p) => ({ name: p.name, level: p.level })) as University["reported_programs"],
    imported_records: u.imported_records?.filter((r) => r.source === "leiden"),
    research_metrics: u.research_metrics?.filter((r) => r.source_url?.startsWith("https://open.leidenranking.com/")),
  } as University;
}
