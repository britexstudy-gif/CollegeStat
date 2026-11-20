import { countryName as knownCountryName } from "@/lib/domain";
import { directoryRankingCountryName } from "@/lib/directory-rankings-shared";
import { regionForCountry, regions } from "@/lib/regions";
import { matchesSearch } from "@/lib/search-text";
import type { DirectoryRankingRow } from "@/lib/directory-rankings";
import {
  CENTRAL_ASIA,
  CENTRAL_ASIA_REGION,
  RANKING_PAGE_SIZE,
  RANKING_SOURCES,
  type NationalBy,
  type RankingData,
  type RankingRow,
  type RankingView,
} from "@/lib/ranking-sources";
import { withAutoLogo } from "./auto-logos";
import { assetJson } from "./asset-data";

/** Catalogue name, then the ISO name; publisher-only codes keep an honest label. */
const countryName = (code: string) => {
  if (code === "CY-N") return "Northern Cyprus";
  const known = knownCountryName(code);
  return known !== code ? known : directoryRankingCountryName(code);
};

type Profile = [string, string, string | null, string | null, string | null, string | null, string | null, string, string[]];
type WorldRecord = {
  name: string;
  provider: string;
  year: number;
  rank: number;
  rank_label?: string | null;
  tied?: boolean;
  score?: string | null;
  url: string;
  country_code: string;
  country_position?: string | null;
  university_id?: string | null;
};
type NationalSnapshot = { providers: { provider: string; records: unknown[] }[] };

// The ranking tables are static assets in production (server/asset-data.ts); each is
// read once per isolate. The national publisher tables are only needed for US and India.
const worldRecords = () => assetJson<WorldRecord[]>("published/ranking-all.json");
const profileIndex = () => assetJson<Record<string, Profile>>("published/ranking-profile-index.json");
const nationalSnapshot = () => assetJson<NationalSnapshot>("published/reviewed-national-rankings.json");
const directoryRows = () => assetJson<Record<"cwur" | "unirank" | "webometrics", DirectoryRankingRow[]>>("generated/directory-ranking-rows.json");
type Sources = {
  records: WorldRecord[];
  profiles: Record<string, Profile>;
  directory: Record<"cwur" | "unirank" | "webometrics", DirectoryRankingRow[]>;
  national?: NationalSnapshot;
};
let sources: Sources;

/** One table line before filtering; `n` is the number the line sorts by. */
type Line = {
  name: string;
  cc: string;
  n: number;
  rank: string;
  score: string | null;
  world: string | null;
  url: string;
  id: string | null;
  tie: string;
};

const WORLD_YEAR = { qs: 2027, the: 2026, arwu: 2026 } as const;
const firstInt = (label: string | undefined | null) => {
  const m = String(label ?? "").match(/\d[\d,]*/);
  return m ? Number(m[0].replace(/,/g, "")) : Number.MAX_SAFE_INTEGER;
};
const label = (r: { rank_label?: string | null; rank: number; tied?: boolean }) =>
  r.rank_label || (r.tied ? "=" : "") + r.rank;

const cache = new Map<string, Line[]>();
function memo(key: string, build: () => Line[]) {
  let rows = cache.get(key);
  if (!rows) cache.set(key, (rows = build()));
  return rows;
}

function worldLines(by: "qs" | "the" | "arwu", nationalPosition = false): Line[] {
  return memo(`${by}:${nationalPosition}`, () =>
    sources.records
      .filter((r) => r.provider === by && r.year === WORLD_YEAR[by])
      .map((r) => {
        const rank = label(r);
        const pos = nationalPosition ? r.country_position : undefined;
        return {
          name: r.name,
          cc: r.country_code,
          n: nationalPosition ? firstInt(pos) : r.rank,
          rank: nationalPosition ? String(pos ?? "") : rank,
          score: r.score ?? null,
          world: nationalPosition ? rank : null,
          url: r.url,
          id: r.university_id ?? null,
          tie: r.name,
        };
      })
      .filter((l) => l.rank),
  );
}

function directoryLines(by: "cwur" | "unirank" | "webometrics", nationalPosition = false): Line[] {
  return memo(`${by}:${nationalPosition}`, () =>
    sources.directory[by].map((r) => {
      const world = r.world_rank === null ? "" : (r.world_tied ? "=" : "") + r.world_rank;
      return {
        name: r.name,
        cc: r.country_code,
        n: nationalPosition ? r.country_rank : (r.world_rank ?? Number.MAX_SAFE_INTEGER),
        rank: nationalPosition ? String(r.country_rank) : world,
        score: null,
        world: nationalPosition ? world || null : null,
        url: r.source_url,
        id: r.university_id,
        tie: r.name,
      };
    }),
  );
}

type NationalRecord = { provider: string; category: string; name: string; rank: number; rank_label: string; country_code: string; university_id: string | null; source_url: string; total_rd_thousand_usd?: number };
function nationalLines(by: "herd" | "nirf"): Line[] {
  return memo(by, () => {
    const source = sources.national?.providers.find((p) => p.provider === by);
    const rows = (source?.records ?? []) as unknown as NationalRecord[];
    const category = by === "nirf" ? "Overall" : rows[0]?.category;
    return rows
      .filter((r) => r.category === category)
      .map((r) => ({
        name: r.name,
        cc: r.country_code,
        n: r.rank,
        rank: r.rank_label,
        score:
          r.total_rd_thousand_usd === undefined
            ? null
            : (r.total_rd_thousand_usd / 1000).toLocaleString("en-US", { maximumFractionDigits: 0 }),
        world: null,
        url: r.source_url,
        id: r.university_id,
        tie: r.name,
      }));
  });
}

function linesFor(by: string, nationalPosition: boolean): Line[] {
  if (by === "qs" || by === "the" || by === "arwu") return worldLines(by, nationalPosition);
  if (by === "cwur" || by === "unirank" || by === "webometrics") return directoryLines(by, nationalPosition);
  if (by === "herd" || by === "nirf") return nationalLines(by);
  return [];
}

const inRegion = (cc: string, region: string) =>
  !region ||
  (region === CENTRAL_ASIA_REGION
    ? (CENTRAL_ASIA as readonly string[]).includes(cc)
    : regionForCountry(cc) === region);

const one = (v: string | null) => (v ?? "").trim();

function toRow(l: Line, i: number, by: string): RankingRow {
  const p = l.id ? sources.profiles[l.id] : undefined;
  return {
    key: `${by}:${l.rank}:${l.name}:${i}`,
    rank: l.rank,
    name: p ? p[1] : l.name,
    cc: l.cc,
    country: countryName(l.cc),
    city: p ? p[2] : null,
    score: l.score,
    world: l.world,
    url: l.url,
    uni: p
      ? withAutoLogo({
          id: l.id!,
          slug: p[0],
          name: p[1],
          website: p[3],
          logo_url: p[4],
          website_icon_url: p[5],
          institution_image_url: p[6],
          country_code: p[7],
        })
      : null,
  };
}

const sourceByKey = new Map<string, (typeof RANKING_SOURCES)[number]>(RANKING_SOURCES.map((s) => [s.key, s]));
const NATIONAL_ORDER: NationalBy[] = ["qs", "the", "arwu", "cwur"];

function nationalCountries() {
  const counts = new Map<string, number>();
  for (const by of NATIONAL_ORDER) {
    const per = new Map<string, number>();
    for (const l of linesFor(by, true)) per.set(l.cc, (per.get(l.cc) ?? 0) + 1);
    for (const [cc, n] of per) counts.set(cc, Math.max(counts.get(cc) ?? 0, n));
  }
  return [...counts]
    .filter(([cc]) => cc)
    .map(([code, count]) => ({ code, name: countryName(code), count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function rankingsView(params: URLSearchParams): Promise<RankingData> {
  const requested = one(params.get("provider"));
  const view: RankingView =
    requested === "national"
      ? "national"
      : sourceByKey.get(requested)?.imported
        ? (requested as RankingView)
        : "qs";
  const q = one(params.get("q")).slice(0, 200);
  const region = one(params.get("region"));
  const validRegion = region === CENTRAL_ASIA_REGION || (regions as readonly string[]).includes(region) ? region : "";
  const requestedPage = Number(params.get("page") || 1);

  const country = one(params.get("country")).toUpperCase().slice(0, 2);
  const needsNational = view === "national" && (country === "US" || country === "IN");
  const [records, profiles, directory, national] = await Promise.all([worldRecords(), profileIndex(), directoryRows(), needsNational ? nationalSnapshot() : undefined]);
  sources = { records, profiles, directory, national };

  let by: string = view;
  let nationalBy: NationalBy[] = [];
  let source: Line[] = [];
  if (view === "national") {
    if (country) {
      nationalBy = NATIONAL_ORDER.filter((b) => linesFor(b, true).some((l) => l.cc === country));
      if (country === "US") nationalBy.push("herd");
      if (country === "IN") nationalBy.push("nirf");
      const wanted = one(params.get("by")) as NationalBy;
      by = nationalBy.includes(wanted) ? wanted : (nationalBy[0] ?? "qs");
      source = nationalBy.length ? linesFor(by, true).filter((l) => l.cc === country) : [];
    }
  } else {
    source = linesFor(view, false);
  }

  const countries =
    view === "national"
      ? nationalCountries()
      : [...new Set(source.filter((l) => inRegion(l.cc, validRegion)).map((l) => l.cc))]
          .filter(Boolean)
          .map((code) => ({ code, name: countryName(code) }))
          .sort((a, b) => a.name.localeCompare(b.name));

  const filtered = source
    .filter(
      (l) =>
        (view === "national" || !country || l.cc === country) &&
        (view === "national" || inRegion(l.cc, validRegion)) &&
        matchesSearch(q, [l.name, ...(l.id && sources.profiles[l.id] ? [sources.profiles[l.id][1], ...sources.profiles[l.id][8]] : [])]),
    )
    .sort((a, b) => a.n - b.n || a.tie.localeCompare(b.tie));

  const pages = Math.max(1, Math.ceil(filtered.length / RANKING_PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1));
  const rows = filtered.slice((page - 1) * RANKING_PAGE_SIZE, page * RANKING_PAGE_SIZE).map((l, i) => toRow(l, i, by));
  const hasScore = filtered.some((l) => l.score);
  return {
    view,
    by,
    q,
    country,
    region: validRegion,
    page,
    pages,
    total: filtered.length,
    sourceTotal: source.length,
    rows,
    countries,
    hasScore,
    scoreLabel: by === "herd" ? "rd" : "score",
    nationalBy,
    edition: sourceByKey.get(by)?.edition ?? "",
  };
}
