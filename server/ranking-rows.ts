import { regionForCountry } from "@/lib/regions";
import records from "@/data/published/ranking-all.json";
import type { University } from "@/lib/domain";
import {
  universityRanks,
  rankingPublishers,
  type Publisher,
} from "@/lib/ranking-highlights";
import { countryName } from "@/lib/domain";
import { matchesSearch } from "@/lib/search-text";
/** Builds a publisher table page from the retained ranking rows and the given profiles. */
export function rankingTableFor(p: URLSearchParams, catalogue: University[]) {
  const byId = new Map(catalogue.map((u) => [u.id, u]));
  const provider = p.get("provider") || "qs";
  const year = provider === "qs" ? 2027 : provider !== "leiden" ? 2026 : 2025;
  const sourceRows = ["qs", "the", "arwu"].includes(provider)
    ? records
        .filter((r) => r.provider === provider && r.year === year)
        .map((r) => ({
          ...r,
          u: r.university_id ? byId.get(r.university_id) : undefined,
        }))
    : catalogue.flatMap((u) => {
        if (provider === "leiden") {
          const r = u.imported_records?.find(
            (r) =>
              r.source === "leiden" &&
              r.metric === "publications_fractional_core",
          );
          return r
            ? [
                {
                  name: u.name,
                  country: countryName(u.country_code),
                  country_code: u.country_code,
                  provider,
                  year,
                  rank: -Number(r.value),
                  rank_label: Number(r.value).toLocaleString(),
                  score: null,
                  url: r.source_url,
                  university_id: u.id,
                  u,
                },
              ]
            : [];
        }
        const r = universityRanks(u).find((r) => r.provider === provider);
        return r
          ? [
              {
                name: u.name,
                country: countryName(u.country_code),
                country_code: u.country_code,
                provider,
                year: r.year,
                rank: r.rank,
                rank_label: r.rank_label || (r.tied ? "=" : "") + r.rank,
                score: r.score || null,
                url: r.url,
                university_id: u.id,
                u,
              },
            ]
          : [];
      });
  const country = p.get("country") || "";
  const region = p.get("region") || "";
  const direction = p.get("sort") === "desc" ? -1 : 1;
  const filtered = sourceRows
    .filter(
      (r) =>
        (!country || r.country_code === country) &&
        (!region || regionForCountry(r.country_code || "") === region) &&
        matchesSearch(p.get("q") || "", [
          r.name,
          r.u?.name,
          ...(r.u?.aliases || []),
        ]),
    )
    .sort(
      (a, b) => direction * (a.rank - b.rank) || a.name.localeCompare(b.name),
    );
  const pages = Math.max(1, Math.ceil(filtered.length / 24));
  const input = Number(p.get("page") || 1);
  const page = Math.min(
    pages,
    Math.max(1, Number.isFinite(input) ? Math.floor(input) : 1),
  );
  return {
    provider,
    region,
    year,
    page,
    pages,
    total: filtered.length,
    sourceTotal: sourceRows.length,
    complete: ["qs", "the", "arwu"].includes(provider),
    countries: [
      ...new Map(
        sourceRows.map((r) => [
          r.country_code,
          { code: r.country_code, name: r.country },
        ]),
      ).values(),
    ]
      .filter((c) => c.code)
      .sort((a, b) => a.name.localeCompare(b.name)),
    rows: filtered.slice((page - 1) * 24, page * 24).map((r, i) => ({
      key: `${provider}:${r.rank}:${r.name}:${i}`,
      name: r.name,
      country: r.country,
      country_code: r.country_code,
      rank: r.rank_label,
      nationalRank: "national_rank" in r ? r.national_rank : null,
      score: r.score,
      url: r.url,
      university: r.u
        ? {
            id: r.u.id,
            name: r.u.name,
            slug: r.u.slug,
            website: r.u.website,
            short_name: r.u.short_name,
            country_code: r.u.country_code,
            logo_url: r.u.logo_url,
            institution_image_url: r.u.institution_image_url,
            website_icon_url: r.u.website_icon_url,
            rankings: universityRanks(r.u),
          }
        : null,
    })),
    publisher:
      provider === "leiden" ? null : rankingPublishers[provider as Publisher],
  };
}
export type RankingTable = ReturnType<typeof rankingTableFor>;
