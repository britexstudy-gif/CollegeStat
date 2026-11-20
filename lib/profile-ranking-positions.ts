import { countryName, type University } from "./domain";
import { directoryRanksForUniversity } from "./directory-ranking-positions";
import { directoryWorldRankLabel } from "./directory-rankings-shared";
import { rankLabel, universityRanks } from "./ranking-highlights";
import {
  regionalRankLabel,
  regionalRanksForUniversity,
} from "./regional-rankings";
import {
  rankingSystems,
  rankingSystemOrder,
  type RankingSystemSlug,
} from "./ranking-systems";

export type ProfileRankingPosition = {
  provider: RankingSystemSlug;
  year: number;
  scope: string;
  subject: string;
  label: string;
  url: string;
  sourceNote?: string;
};

function publicSource(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      ["https:", "http:"].includes(parsed.protocol) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

const worldScope = (scope: string) =>
  /^(global|world)$/i.test(scope) ? "World" : scope;

/** Present independently sourced positions without combining unlike tables. */
export function profileRankingPositions(
  university: University,
): ProfileRankingPosition[] {
  const scopedUniversity = {
    ...university,
    ranking_entries: (university.ranking_entries || []).filter(
      (entry) =>
        entry.university_id === university.id &&
        entry.canonical !== false &&
        entry.verification_status === "verified" &&
        entry.source_id &&
        entry.verified_at,
    ),
  };
  const global = universityRanks(scopedUniversity).map((rank) => ({
    provider: rank.provider,
    year: rank.year,
    scope: "World",
    subject: "Overall",
    label: rankLabel(rank),
    url: rank.url,
  }));
  const regional = regionalRanksForUniversity(scopedUniversity).map((rank) => ({
    provider: "qs" as const,
    year: rank.year,
    scope: rank.scope,
    subject: "Overall",
    label: regionalRankLabel(rank.rank_label),
    url: rank.source_url,
  }));
  const verified = scopedUniversity.ranking_entries.flatMap(
    (entry): ProfileRankingPosition[] => {
      const edition = entry.ranking_editions;
      const provider = edition?.ranking_providers?.slug;
      const system = rankingSystems.find((system) => system.slug === provider);
      if (
        entry.university_id !== university.id ||
        entry.verification_status !== "verified" ||
        !edition?.permitted ||
        !Number.isInteger(edition.year) ||
        !system ||
        !system.imported ||
        system.slug === "leiden" ||
        !edition.region?.trim() ||
        !edition.subject?.trim()
      )
        return [];
      const raw = entry.rank_label?.trim() || String(entry.rank || "");
      // A publisher band or tie is a label, never an inferred exact place.
      if (!/^=?[1-9]\d*(?:\s*[-–]\s*[1-9]\d*|\+)?$/.test(raw)) return [];
      const url = entry.source_url || entry.data_sources?.url || system.url;
      if (!publicSource(url)) return [];
      const label =
        /^=?\d+$/.test(raw) && !raw.startsWith("=") ? `#${raw}` : raw;
      return [
        {
          provider: system.slug,
          year: edition.year,
          scope: worldScope(edition.region),
          subject: edition.subject,
          label,
          url,
        },
      ];
    },
  );

  const directory: ProfileRankingPosition[] = directoryRanksForUniversity(
    university,
  ).flatMap(({ provider, row }) => {
    const sourceNote =
      provider === "webometrics"
        ? "July 2026 · corrected v3"
        : provider === "cwur"
          ? "2026 · publisher table"
          : provider === "urap"
            ? "2025–2026 · publisher table"
            : "2026 · university reported";
    const year = provider === "urap" ? 2025 : 2026;
    return [
      ...(row.world_rank === null
        ? []
        : [
            {
              provider,
              year,
              scope: "World",
              subject: "Overall",
              label: directoryWorldRankLabel(row),
              url: row.source_url,
              sourceNote,
            },
          ]),
      ...(row.country_rank > 0
        ? [
            {
              provider,
              year,
              scope: countryName(row.country_code),
              subject: "Overall",
              label: `#${row.country_rank}`,
              url: row.source_url,
              sourceNote,
            },
          ]
        : []),
    ];
  });
  const rows = [...global, ...regional, ...verified, ...directory].filter(
    (row) => publicSource(row.url),
  );
  const groups = new Map<string, ProfileRankingPosition[]>();
  for (const row of rows) {
    const key = [row.provider, row.scope, row.subject].join("\u0000");
    const previous = groups.get(key) || [];
    groups.set(key, [...previous, row]);
  }
  return [...groups.values()]
    .flatMap((records) => {
      const latestYear = Math.max(...records.map((record) => record.year));
      const latest = records.filter((record) => record.year === latestYear);
      // Conflicting positions need review; neither value should appear as settled.
      if (new Set(latest.map((record) => record.label)).size > 1) return [];
      return [latest[latest.length - 1]];
    })
    .sort(
      (a, b) =>
        rankingSystemOrder(a.provider) - rankingSystemOrder(b.provider) ||
        Number(b.scope === "World") - Number(a.scope === "World") ||
        a.scope.localeCompare(b.scope) ||
        a.subject.localeCompare(b.subject),
    );
}
