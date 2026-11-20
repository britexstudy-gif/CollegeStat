import { regionForCountry } from "@/lib/regions";
import { withAutoLogo } from "./auto-logos";
import { assetJson, fromAssets } from "./asset-data";
import { catalogueList } from "./catalogue-store";
import {
  universityRanks,
  rankingPublishers,
  type Publisher,
} from "@/lib/ranking-highlights";
import { countryName } from "@/lib/domain";
import { matchesSearch } from "@/lib/search-text";
import {
  regionalRankingRecords,
  regionalEditions,
  resolveRegionalScope,
  type RegionalEdition,
} from "@/lib/regional-rankings";
import type { University, University as CatalogueRow } from "@/lib/domain";
import { directoryRanksForUniversity } from "@/lib/directory-ranking-positions";
import { directoryWorldRankLabel } from "@/lib/directory-rankings-shared";
import {
  reviewedLeidenCore,
  LEIDEN_RANKING_CONTEXT,
} from "./leiden-ranking-profiles";
/** Catalogue rows the world and regional tables join to (name, aliases, logo, ranks).
 * Production reads the slim subset scripts/build-asset-data.ts publishes; dev and tests read the full list. */
type WorldRecord = {
  name: string;
  country: string;
  country_code: string;
  provider: string;
  year: number;
  rank: number;
  rank_label?: string | null;
  tied?: boolean;
  score?: string | null;
  url: string;
  university_id?: string | null;
  national_rank?: string | null;
};
type Joined = {
  rows: CatalogueRow[];
  byId: Map<string, CatalogueRow>;
  byHost: Map<string, CatalogueRow>;
};
let joined: Promise<Joined> | undefined;
const joinRows = () =>
  (joined ??= (fromAssets ? assetJson<CatalogueRow[]>("generated/ranking-profiles.json") : catalogueList()).then((rows) => ({
    rows,
    byId: new Map(rows.map((u) => [u.id, u])),
    byHost: new Map(
      rows.flatMap((u) => {
        try {
          const host = new URL(u.website || "").hostname.replace(/^www\./, "");
          return [[host === "nus.edu" ? "nus.edu.sg" : host, u] as const];
        } catch {
          return [];
        }
      }),
    ),
  })).catch((error) => {
    joined = undefined;
    throw error;
  }));
type SourceRow = {
  name: string;
  country: string;
  country_code: string;
  provider: string;
  year: number;
  rank: number;
  rank_label: string;
  score: string | null;
  url: string;
  u?: University;
  national_rank?: string | null;
};
export type RegionalRecord = {
  domain: string;
  name: string;
  scope: string;
  year: number;
  rank_label: string;
  source_url: string;
  country_code?: string;
  university?: University;
};
export async function rankingTable(
  p: URLSearchParams,
  regionalRecords: readonly RegionalRecord[] = regionalRankingRecords,
  availableEditions: readonly RegionalEdition[] = regionalEditions,
  leidenProfiles?: readonly University[],
) {
  const { byId, byHost, rows: catalogueRows } = await joinRows();
  const records = await assetJson<WorldRecord[]>("published/ranking-all.json");
  leidenProfiles ??= catalogueRows;
  const scope = p.get("scope") === "regional" ? "regional" : "world";
  const regionalScope = resolveRegionalScope(
    p.get("edition"),
    availableEditions,
  );
  const provider =
    scope === "regional"
      ? "qs"
      : ["qs", "the", "arwu", "leiden"].includes(p.get("provider") || "")
        ? p.get("provider")!
        : "qs";
  const worldYear =
    provider === "qs" ? 2027 : provider !== "leiden" ? 2026 : 2025;
  const sourceRows: SourceRow[] =
    scope === "regional"
      ? regionalRecords
          .filter((r) => r.scope === regionalScope)
          .map((r) => {
            const u = r.university || byHost.get(r.domain);
            const code =
              u?.country_code ||
              ("country_code" in r ? String(r.country_code) : "");
            const parsedRank = Number(r.rank_label.match(/^=?([0-9]+)/)?.[1]);
            return {
              name: r.name,
              country: code ? countryName(code) : "",
              country_code: code,
              provider: "qs",
              year: r.year,
              rank: Number.isFinite(parsedRank)
                ? parsedRank
                : Number.MAX_SAFE_INTEGER,
              rank_label: r.rank_label,
              score: null,
              url: r.source_url,
              u,
            };
          })
      : ["qs", "the", "arwu"].includes(provider)
        ? records
            .filter((r) => r.provider === provider && r.year === worldYear)
            .map((r) => ({
              ...r,
              rank_label: r.rank_label || (r.tied ? "=" : "") + r.rank,
              score: r.score ?? null,
              u: r.university_id ? byId.get(r.university_id) : undefined,
            }))
        : leidenProfiles.flatMap((u) => {
            if (provider === "leiden") {
              const r = reviewedLeidenCore(u);
              return r
                ? [
                    {
                      name: u.name,
                      country: countryName(u.country_code),
                      country_code: u.country_code,
                      provider,
                      year: worldYear,
                      rank: -Number(r.value),
                      rank_label: r.value.toLocaleString("en-US", {
                        maximumFractionDigits: 20,
                      }),
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
    scope,
    scopeLabel: scope === "regional" ? regionalScope : "World",
    regionalEditions: availableEditions,
    region,
    year:
      sourceRows[0]?.year ||
      (scope === "regional"
        ? availableEditions.find((edition) => edition.scope === regionalScope)
            ?.year
        : undefined) ||
      worldYear,
    page,
    pages,
    total: filtered.length,
    sourceTotal: sourceRows.length,
    complete: scope === "world" && ["qs", "the", "arwu"].includes(provider),
    indicatorContext: provider === "leiden" ? LEIDEN_RANKING_CONTEXT : null,
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
      // Logo resolved here so the table never needs the client-side icon map.
      university: r.u
        ? withAutoLogo({
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
          })
        : null,
      // Directory publishers resolved here so the 160 KB index stays server-side.
      directoryRanks: r.u
        ? directoryRanksForUniversity(r.u).flatMap(({ provider, row }) =>
            row.world_rank === null
              ? []
              : [
                  {
                    provider,
                    label: directoryWorldRankLabel(row),
                    url: row.source_url,
                  },
                ],
          )
        : [],
    })),
    publisher:
      provider === "leiden" ? null : rankingPublishers[provider as Publisher],
  };
}
export type RankingTable = Awaited<ReturnType<typeof rankingTable>>;
