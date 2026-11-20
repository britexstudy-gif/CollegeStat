import webometrics from "../data/published/reviewed-webometrics-oct15.json";
import unirank from "../data/published/reviewed-unirank-oct15.json";
import cited from "../data/published/cited-ranking-tables-oct20.json";
import { matchesSearch } from "./search-text";
import {
  directoryRankingCountryName,
  type DirectoryRankingProvider,
} from "./directory-rankings-shared";
export {
  directoryWorldRankLabel,
  type DirectoryRankingProvider,
} from "./directory-rankings-shared";
export type DirectoryRankingRow = {
  name: string;
  country_code: string;
  world_rank: number | null;
  country_rank: number;
  world_tied?: boolean;
  university_id: string | null;
  slug: string | null;
  ror: string | null;
  domain: string;
  source_url: string;
  source_kind: "author_release" | "university_report" | "publisher_table";
};

const directoryRankingSources = {
  webometrics: {
    name: "Webometrics",
    edition: webometrics.edition,
    year: webometrics.year,
    url: webometrics.source_url,
    description:
      "A university ranking combining web visibility, openness and scholarly impact.",
    coverage:
      "Public July 2026 selection: up to 15 institutions per country. Gaps remain as published. This is not the complete 32,000-institution table.",
    attribution: "Isidro F. Aguillo · Cybermetrics Lab (IPP-CSIC) · CC BY 4.0",
    licenseUrl: webometrics.license_url,
    profileMatches: webometrics.counts.profile_matches,
    complete: false,
  },
  unirank: {
    name: "uniRank",
    edition: unirank.edition,
    year: unirank.year,
    url: "https://www.unirank.org/",
    description:
      "A non-academic university ranking based on web presence and popularity.",
    coverage:
      "Five positions reported by three universities in 2026. Each result links to its university’s announcement; coverage is very limited.",
    attribution:
      "Positions reported by the universities; the full uniRank table is available from the publisher.",
    licenseUrl: null,
    profileMatches: unirank.records.length,
    complete: false,
  },
  cwur: {
    name: "CWUR",
    edition: cited.providers.cwur.edition,
    year: cited.providers.cwur.year,
    url: cited.providers.cwur.source_url,
    description:
      "Center for World University Rankings: education, employability, faculty and research output.",
    coverage:
      "Top 2,000 universities as published by CWUR. Each position links to the publisher.",
    attribution: cited.providers.cwur.attribution,
    licenseUrl: null,
    profileMatches: cited.cwur.filter((row) => row[4]).length,
    complete: true,
  },
  urap: {
    name: "URAP",
    edition: cited.providers.urap.edition,
    year: cited.providers.urap.year,
    url: cited.providers.urap.source_url,
    description:
      "University Ranking by Academic Performance (METU): publications, citations and research impact.",
    coverage:
      "Top 3,000 universities as published by URAP. Country position is the order within URAP’s own table.",
    attribution: cited.providers.urap.attribution,
    licenseUrl: null,
    profileMatches: cited.urap.filter((row) => row[4]).length,
    complete: true,
  },
} as const;

type CitedRow = [string, string, number, number, string | null, string | null, string, string];
const citedRows = (rows: unknown[]): DirectoryRankingRow[] =>
  (rows as CitedRow[]).map(([name, country_code, world_rank, country_rank, university_id, slug, domain, source_url]) => ({
    name,
    country_code,
    world_rank,
    country_rank,
    university_id,
    slug,
    ror: null,
    domain,
    source_url,
    source_kind: "publisher_table",
  }));

const reviewedRows: Record<DirectoryRankingProvider, DirectoryRankingRow[]> = {
  webometrics: webometrics.records.map((row) => ({
    ...row,
    domain: row.domains[0],
    source_url: `${webometrics.download_url}#page=${row.page}`,
    source_kind: "author_release",
  })),
  unirank: unirank.records.map((row) => ({
    ...row,
    source_kind: "university_report",
  })),
  cwur: citedRows(cited.cwur),
  urap: citedRows(cited.urap),
};

/** Country filters preserve the publisher's world and country positions. */
export function directoryRankingTable(
  provider: DirectoryRankingProvider,
  params: URLSearchParams,
) {
  const source = directoryRankingSources[provider];
  const all = reviewedRows[provider];
  const country = params.get("country") || "";
  const q = (params.get("q") || "").trim().slice(0, 200);
  const direction = params.get("sort") === "desc" ? -1 : 1;
  const filtered = all
    .filter(
      (row) =>
        (!country || row.country_code === country) &&
        matchesSearch(q, [
          row.name,
          row.domain,
          row.country_code,
          directoryRankingCountryName(row.country_code),
        ]),
    )
    .sort((a, b) => {
      if (a.world_rank === null)
        return b.world_rank === null ? a.name.localeCompare(b.name) : 1;
      if (b.world_rank === null) return -1;
      return (
        direction * (a.world_rank - b.world_rank) ||
        a.name.localeCompare(b.name)
      );
    });
  const pages = Math.max(1, Math.ceil(filtered.length / 24));
  const requestedPage = Number(params.get("page") || 1);
  const page = Math.min(
    pages,
    Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1),
  );
  return {
    provider,
    source,
    country,
    q,
    complete: false,
    sourceTotal: all.length,
    countries: [...new Set(all.map((row) => row.country_code))]
      .map((code) => ({ code, name: directoryRankingCountryName(code) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    total: filtered.length,
    pages,
    page,
    rows: filtered.slice((page - 1) * 24, page * 24),
  };
}

/** Every published row of one directory source, in source order. */
export const directoryRankingRows = (provider: DirectoryRankingProvider) =>
  reviewedRows[provider];
