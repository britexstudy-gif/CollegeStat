import { matchesSearch, normalizeSearch } from "./search-text";

export type NationalRankingProvider = "herd" | "nirf";
export interface NationalRankingRecord {
  id: string; provider: NationalRankingProvider; year: number; category: string;
  name: string; rank: number; rank_label: string; country_code: string;
  university_id: string | null; identity_status: string; source_url: string;
  reporting_period: string; retrieved_at: string; scope: string;
  publication_status: string; verification_status: string;
  total_rd_thousand_usd?: number; imputed?: boolean; tied?: boolean;
}
export interface NationalRankingSource {
  provider: NationalRankingProvider; name: string; year: number; scope: string;
  complete: boolean; licence: string; population: string; reporting_period: string;
  source: { url: string; retrieved_at: string };
  licence_evidence: { url: string };
  counts: { positions: number; profile_matches: number; unique_profile_matches: number };
  records: NationalRankingRecord[];
}
export interface NationalRankingSnapshot {
  status: string; reviewed_at: string; providers: NationalRankingSource[];
}
export type NationalRankingRow = NationalRankingRecord & {
  university?: { slug: string; name: string; logo_url: string | null };
};
export interface NationalRankingTable {
  provider: NationalRankingProvider; name: string; year: number; scope: string;
  complete: boolean; licence: string; population: string; reportingPeriod: string;
  sourceUrl: string; licenceUrl: string; retrievedAt: string; reviewedAt: string;
  sourceTotal: number; profileMatches: number; snapshotStatus: string;
  categories: string[]; category: string; q: string; rows: NationalRankingRow[];
  total: number; page: number; pages: number;
}

/** Source scopes are never combined or re-ranked. Pagination retains original positions. */
export function nationalRankingTable(
  snapshot: NationalRankingSnapshot,
  params: URLSearchParams,
  identityNames: Readonly<Record<string, readonly string[]>> = {},
  reviewedIdentityLinks: Readonly<Record<string, string>> = {},
): NationalRankingTable {
  const provider = params.get("provider") === "nirf" ? "nirf" : "herd";
  const source = snapshot.providers.find(p => p.provider === provider);
  if (!source) throw new Error("Reviewed ranking source unavailable");
  const categories = [...new Set(source.records.map(r => r.category))].sort();
  const requested = params.get("category");
  const category = requested && categories.includes(requested)
    ? requested : provider === "nirf" ? "Overall" : categories[0];
  const q = (params.get("q") || "").trim().slice(0, 200);
  const linkedIdentity = (r: NationalRankingRecord) => r.university_id || (
    r.identity_status !== "aggregate_reporting_unit" ? reviewedIdentityLinks[r.id] || null : null
  );
  const names = (r: NationalRankingRecord) => {
    const id = linkedIdentity(r);
    return [r.name, ...(id ? identityNames[id] || [] : [])];
  };
  const scoped = source.records.filter(r => r.category === category);
  const exact = q ? scoped.filter(r => names(r).some(name => normalizeSearch(name) === normalizeSearch(q))) : [];
  const records = (exact.length ? exact : scoped.filter(r => matchesSearch(q, names(r))))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  const pages = Math.max(1, Math.ceil(records.length / 24));
  const requestedPage = Number(params.get("page"));
  const page = Math.min(pages, Math.max(1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 1));
  return {
    provider, name: source.name, year: source.year, scope: source.scope,
    complete: source.complete, licence: source.licence, population: source.population,
    reportingPeriod: source.reporting_period, sourceUrl: source.source.url,
    licenceUrl: source.licence_evidence.url, retrievedAt: source.source.retrieved_at,
    reviewedAt: snapshot.reviewed_at, sourceTotal: source.records.length,
    profileMatches: source.records.filter(r => linkedIdentity(r)).length, snapshotStatus: snapshot.status,
    categories, category, q, total: records.length, pages, page,
    rows: records.slice((page - 1) * 24, page * 24).map(record => ({
      ...record,
      university_id: linkedIdentity(record),
      identity_status: !record.university_id && linkedIdentity(record)
        ? "reviewed_registry_identity" : record.identity_status,
    })),
  };
}
