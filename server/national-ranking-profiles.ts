import { abortable } from "@/lib/abortable";
import type { NationalRankingTable } from "@/lib/national-rankings";
import type { University } from "@/lib/domain";

/** Optional profile links never delay or suppress reviewed publisher positions. */
export async function hydrateNationalRankingProfiles(
  table: NationalRankingTable,
  lookup: (ids: string[], signal: AbortSignal) => Promise<University[]>,
  requestSignal: AbortSignal,
  timeoutMs = 2500,
) {
  const ids = [
    ...new Set(
      table.rows.flatMap((row) =>
        row.university_id ? [row.university_id] : [],
      ),
    ),
  ];
  if (!ids.length) return table;
  const signal = AbortSignal.any([
    requestSignal,
    AbortSignal.timeout(timeoutMs),
  ]);
  const profiles = await abortable(lookup(ids, signal), signal).catch(() => []);
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  for (const row of table.rows) {
    const university = row.university_id
      ? byId.get(row.university_id)
      : undefined;
    if (university)
      row.university = {
        slug: university.slug,
        name: university.name,
        logo_url: university.logo_url,
      };
  }
  return table;
}
