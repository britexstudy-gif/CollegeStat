import type { University } from "./domain";

// A bounded, cited selection of factual positions, not a publisher dataset.
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
const qsSource =
  "https://www.econ.muni.cz/do/econ/soubory/oddeleni/ozs/admissions/2026_QS_World_University_Rankings_1.2__For_qs.com__11.2025.pdf";
const theUS =
  "https://beta.timeshighereducation.com/student/best-universities/best-universities-united-states";
const theUK =
  "https://beta.timeshighereducation.com/student/best-universities/best-universities-uk";
const qs: [string, number, boolean?][] = [
  ["mit.edu", 1],
  ["imperial.ac.uk", 2],
  ["stanford.edu", 3],
  ["ox.ac.uk", 4],
  ["harvard.edu", 5],
  ["cam.ac.uk", 6],
  ["ethz.ch", 7],
  ["nus.edu.sg", 8],
  ["ucl.ac.uk", 9],
  ["caltech.edu", 10],
  ["tum.de", 22, true],
  ["utoronto.ca", 29],
  ["princeton.edu", 25, true],
  ["berkeley.edu", 17, true],
  ["yale.edu", 21],
  ["columbia.edu", 38, true],
  ["uchicago.edu", 13],
];
const the: [string, number, string, boolean?][] = [
  ["ox.ac.uk", 1, theUK],
  ["mit.edu", 2, theUS],
  ["princeton.edu", 3, theUS, true],
  ["cam.ac.uk", 3, theUK, true],
  ["harvard.edu", 5, theUS, true],
  ["stanford.edu", 5, theUS, true],
  ["caltech.edu", 7, theUS],
  ["imperial.ac.uk", 8, theUK],
  ["berkeley.edu", 9, theUS],
  ["yale.edu", 10, theUS],
  ["ucl.ac.uk", 22, theUK],
  ["columbia.edu", 20, theUS],
  ["uchicago.edu", 15, theUS],
  [
    "tum.de",
    27,
    "https://www.timeshighereducation.com/world-university-rankings/world-university-rankings-2026-colliding-forces",
  ],
  [
    "utoronto.ca",
    21,
    "https://www.timeshighereducation.com/world-university-rankings/world-university-rankings-2026-colliding-forces",
  ],
  [
    "ethz.ch",
    11,
    "https://www.timeshighereducation.com/world-university-rankings/world-university-rankings-2026-colliding-forces",
  ],
];
const arwu = [
  "harvard.edu",
  "stanford.edu",
  "mit.edu",
  "cam.ac.uk",
  "berkeley.edu",
  "ox.ac.uk",
  "princeton.edu",
  "columbia.edu",
  "caltech.edu",
  "uchicago.edu",
];
export const rankingHighlights: RankHighlight[] = [
  ...qs.map(([domain, rank, tied]) => ({
    domain,
    rank,
    tied: !!tied,
    provider: "qs" as const,
    year: 2026,
    url: qsSource,
  })),
  ...the.map(([domain, rank, url, tied]) => ({
    domain,
    rank,
    tied: !!tied,
    provider: "the" as const,
    year: 2026,
    url,
  })),
  ...arwu.map((domain, i) => ({
    domain,
    rank: i + 1,
    tied: false,
    provider: "arwu" as const,
    year: 2025,
    url: "https://www.shanghairanking.com/rankings/arwu/2025",
  })),
];
export function universityRanks(
  u: Pick<University, "website"> & { id?: string; rankings?: RankHighlight[]; ranking_entries?: University['ranking_entries'] },
) {
  let host = "";
  try {
    host = new URL(u.website || "").hostname.replace(/^www\./, "");
  } catch {}
  if (host === "nus.edu") host = "nus.edu.sg";
  const live = (u.ranking_entries || []).flatMap((entry): RankHighlight[] => {
    const edition = entry.ranking_editions;
    const publisher = edition?.ranking_providers;
    if (entry.verification_status !== 'verified' || !edition?.permitted || edition.subject !== 'Overall' || edition.region !== 'Global' || !publisher || !['qs','the','arwu'].includes(publisher.slug)) return [];
    const label = entry.rank_label;
    const rank = entry.rank ?? Number(label?.match(/^=?([0-9]+)/)?.[1]);
    if (!rank || !Number.isFinite(rank)) return [];
    return [{domain:'',provider:publisher.slug as Publisher,year:edition.year,rank,tied:label?.startsWith('=') || false,band:!!label && /[–-]|\+$/.test(label),rank_label:label || undefined,url:entry.source_url || entry.data_sources?.url || publisher.website || rankingPublishers[publisher.slug as Publisher].url}];
  });
  const all = [...live,...(u.rankings || [])].sort(
    (a, b) => b.year - a.year,
  );
  const published = all.filter(
    (r, i) => all.findIndex((p) => p.provider === r.provider) === i,
  );
  return [
    ...published,
    ...rankingHighlights.filter(
      (r) =>
        r.domain === host && !published.some((p) => p.provider === r.provider),
    ),
  ];
}
export const rankLabel = (r: RankHighlight) =>
  r.rank_label
    ? `${r.band || r.tied ? "" : "#"}${r.rank_label}`
    : `${r.tied ? "=" : "#"}${r.rank}`;
