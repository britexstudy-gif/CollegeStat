import { cache } from "react";
import { assetJson } from "./asset-data";

export type SimilarUniversity = { slug: string; name: string; city?: string | null };

type Ranked = { university_id: string; provider: string; year: number; rank: number | null; country_code: string };
/** id -> [slug, name, city, ...] */
type Index = Record<string, [string, string, string | null]>;
const QS_YEAR = 2027;

/** Up to six same-country universities with the closest QS positions, or the
 * country's top-ranked schools when this one is unranked. Read from the two
 * published ranking files (static assets, parsed once per isolate): no
 * Supabase round trips, so it never slows the profile render. */
export const similarUniversities = cache(async (u: { id: string; country_code: string }): Promise<SimilarUniversity[]> => {
  if (!u.country_code) return [];
  try {
    const [all, index] = await Promise.all([
      assetJson<Ranked[]>("published/ranking-all.json"),
      assetJson<Index>("published/ranking-profile-index.json"),
    ]);
    const rows = all
      .filter((r) => r.provider === "qs" && r.year === QS_YEAR && r.country_code === u.country_code && r.rank != null && index[r.university_id])
      .sort((a, b) => a.rank! - b.rank!);
    const own = rows.findIndex((r) => r.university_id === u.id);
    const others = rows.filter((r) => r.university_id !== u.id);
    const around = own < 0 ? 0 : Math.max(0, Math.min(own - 3, others.length - 6));
    return others.slice(around, around + 6).map((r) => {
      const [slug, name, city] = index[r.university_id];
      return { slug, name, city };
    });
  } catch {
    return [];
  }
});
