import type { University } from "./domain";

// Publisher metadata describes editions; ranking positions come from sourced observations.
export const rankingPublishers = {
  qs: {
    name: "QS",
    year: 2027,
    url: "https://www.topuniversities.com/world-university-rankings",
    description: "Reputation, research, employability and international reach.",
  },
  the: {
    name: "THE",
    year: 2026,
    url: "https://www.timeshighereducation.com/world-university-rankings/2026/world-ranking",
    description:
      "Teaching, research environment, research quality, industry and international outlook.",
  },
  arwu: {
    name: "ARWU",
    year: 2026,
    url: "https://www.shanghairanking.com/rankings/arwu/2026",
    description:
      "Research achievement, highly cited researchers and scientific publications.",
  },
} as const;
export type Publisher = keyof typeof rankingPublishers;
export type RankHighlight = {
  domain: string;
  provider: Publisher;
  year: number;
  rank: number;
  tied: boolean;
  url: string;
  rank_label?: string;
  band?: boolean;
  national_rank?: string | null;
  country_position?: string;
  country_total?: number;
  score?: string | null;
  scores?: Record<string, string | undefined>;
};
export function universityRanks(
  u: Pick<University, "website"> & {
    id?: string;
    rankings?: RankHighlight[];
    ranking_entries?: University["ranking_entries"];
  },
) {
  const live = (u.ranking_entries || []).flatMap((entry): RankHighlight[] => {
    const edition = entry.ranking_editions;
    const publisher = edition?.ranking_providers;
    if (
      entry.verification_status !== "verified" ||
      !edition?.permitted ||
      edition.subject !== "Overall" ||
      edition.region !== "Global" ||
      !publisher ||
      !["qs", "the", "arwu"].includes(publisher.slug)
    )
      return [];
    const label = entry.rank_label;
    const rank = entry.rank ?? Number(label?.match(/^=?([0-9]+)/)?.[1]);
    if (!rank || !Number.isFinite(rank)) return [];
    return [
      {
        domain: "",
        provider: publisher.slug as Publisher,
        year: edition.year,
        rank,
        tied: label?.startsWith("=") || false,
        band: !!label && /[–-]|\+$/.test(label),
        rank_label: label || undefined,
        url:
          entry.source_url ||
          entry.data_sources?.url ||
          publisher.website ||
          rankingPublishers[publisher.slug as Publisher].url,
      },
    ];
  });
  const all = [...live, ...(u.rankings || [])].sort((a, b) => b.year - a.year);
  const published = all.filter(
    (r, i) => all.findIndex((p) => p.provider === r.provider) === i,
  );
  return published;
}
export const rankLabel = (r: RankHighlight) =>
  r.rank_label
    ? `${r.band || r.tied ? "" : "#"}${r.rank_label}`
    : `${r.tied ? "=" : "#"}${r.rank}`;
