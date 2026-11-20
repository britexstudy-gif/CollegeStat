import records from "@/data/published/regional-rankings.json";
import type { University } from "./domain";
export type RegionalEdition = { scope: string; year: number; url?: string };

/** A verified edition establishes scope; the bundled selection is not an allowlist. */
function isRegionalScope(scope: string) {
  return (
    !!scope.trim() &&
    scope.length <= 100 &&
    !["global", "world", "all"].includes(scope.trim().toLowerCase())
  );
}
export function latestRegionalEditions(
  editions: readonly RegionalEdition[],
): RegionalEdition[] {
  const latest = new Map<string, RegionalEdition>();
  for (const edition of editions) {
    if (
      !isRegionalScope(edition.scope) ||
      !Number.isInteger(edition.year) ||
      edition.year < 1900 ||
      edition.year > 2100
    )
      continue;
    const previous = latest.get(edition.scope);
    if (!previous || edition.year > previous.year)
      latest.set(edition.scope, edition);
  }
  return [...latest.values()].sort((a, b) => a.scope.localeCompare(b.scope));
}
export function resolveRegionalScope(
  requested: string | null,
  editions: readonly RegionalEdition[],
) {
  if (editions.some((edition) => edition.scope === requested))
    return requested!;
  return (
    editions.find((edition) => edition.scope === "Europe")?.scope ||
    editions[0]?.scope ||
    "Europe"
  );
}
export const regionalEditions = latestRegionalEditions(
  records.map((r) => ({ scope: r.scope, year: r.year, url: r.source_url })),
);
export { records as regionalRankingRecords };
export function regionalRanksForUniversity(
  u: Pick<University, "website"> &
    Partial<Pick<University, "ranking_entries" | "name">>,
) {
  let host = "";
  try {
    const original = new URL(u.website || "").hostname.replace(/^www\./, "");
    host = original === "nus.edu" ? "nus.edu.sg" : original;
  } catch {
    /* Hosted UUID-linked evidence does not require a website. */
  }
  const snapshot = records.filter(
    (r) => !!host && (host === r.domain || host.endsWith("." + r.domain)),
  );
  const hosted = (u.ranking_entries || []).flatMap((r) => {
    const edition = r.ranking_editions;
    if (
      r.verification_status !== "verified" ||
      !r.verified_at ||
      !r.source_id ||
      !edition?.permitted ||
      edition.subject !== "Overall" ||
      edition.ranking_providers?.slug !== "qs" ||
      !isRegionalScope(edition.region) ||
      (!r.rank_label && !r.rank)
    )
      return [];
    const source = r.source_url || r.data_sources?.url;
    if (!source?.startsWith("https://")) return [];
    return [
      {
        domain: host,
        name: u.name || snapshot[0]?.name || "University",
        provider: "QS",
        scope: edition.region,
        year: edition.year,
        rank_label: r.rank_label || String(r.rank),
        source_url: source,
        checked_at: r.verified_at,
      },
    ];
  });
  // The newest verified edition for each scope wins; current hosted corrections
  // supersede the bundled snapshot while preserving its untouched scopes.
  return [
    ...new Map(
      [...snapshot, ...hosted]
        .sort((a, b) => a.year - b.year)
        .map((r) => [r.scope, r]),
    ).values(),
  ];
}
export function regionalRankLabel(label: string) {
  return /^=|[-–+]/.test(label) ? label : "#" + label;
}
