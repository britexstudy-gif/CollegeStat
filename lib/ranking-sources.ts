/** The publishers the rankings page switches between. Shared by the server
 * table builder and the client view, so it holds plain data only. */
export const RANKING_SOURCES = [
  // mark: "full" the whole logo on a white plate; "crop" its square badge; "dark"
  // a logo drawn in white, on a dark plate; "letter" a monogram, for a
  // wordmark-only logo that is illegible at 28px.
  { key: "qs", mark: "full", name: "QS", logo: "/logos/publishers/qs.png", edition: "2027", url: "https://www.topuniversities.com/world-university-rankings", imported: true },
  { key: "the", mark: "full", name: "THE", logo: "/logos/publishers/the.svg", edition: "2026", url: "https://www.timeshighereducation.com/world-university-rankings", imported: true },
  { key: "arwu", mark: "dark", name: "ARWU", logo: "/logos/publishers/arwu.svg", edition: "2026", url: "https://www.shanghairanking.com/rankings/arwu/2026", imported: true },
  { key: "cwur", mark: "full", name: "CWUR", logo: "/logos/publishers/cwur.svg", edition: "2026", url: "https://cwur.org/2026.php", imported: true },
  { key: "usnews", mark: "full", name: "U.S. News", logo: "/logos/publishers/usnews.svg", edition: "", url: "https://www.usnews.com/education/best-global-universities", imported: false },
  { key: "unirank", mark: "full", name: "uniRank", logo: "/logos/publishers/unirank.png", edition: "2026", url: "https://www.unirank.org/", imported: true },
  { key: "webometrics", mark: "full", name: "Webometrics", logo: "/logos/publishers/webometrics.png", edition: "2026", url: "https://www.webometrics.info/en/world", imported: true },
] as const;

export type RankingSourceKey = (typeof RANKING_SOURCES)[number]["key"];
export type RankingView = RankingSourceKey | "national";

/** Sources that can rank the universities of one country. */
export type NationalBy = "qs" | "the" | "arwu" | "cwur" | "herd" | "nirf";
export const NATIONAL_SOURCES: Record<NationalBy, { name: string; url: string }> = {
  qs: { name: "QS", url: "https://www.topuniversities.com/world-university-rankings" },
  the: { name: "THE", url: "https://www.timeshighereducation.com/world-university-rankings" },
  arwu: { name: "ARWU", url: "https://www.shanghairanking.com/rankings/arwu/2026" },
  cwur: { name: "CWUR", url: "https://cwur.org/2026.php" },
  herd: { name: "NCSES", url: "https://ncses.nsf.gov/surveys/higher-education-research-development" },
  nirf: { name: "NIRF", url: "https://www.nirfindia.org/" },
};

export const CENTRAL_ASIA = ["KZ", "UZ", "KG", "TJ", "TM"] as const;
export const CENTRAL_ASIA_REGION = "central-asia";
export const RANKING_PAGE_SIZE = 50;

export type RankingRow = {
  key: string;
  rank: string;
  name: string;
  cc: string;
  country: string;
  city: string | null;
  score: string | null;
  /** Position in the world table, shown beside a national position. */
  world: string | null;
  url: string;
  uni: {
    id: string;
    slug: string;
    name: string;
    website: string | null;
    logo_url: string | null;
    website_icon_url: string | null;
    institution_image_url: string | null;
    country_code: string;
    auto_logo: string | null;
  } | null;
};

export type RankingData = {
  view: RankingView;
  /** Table source: a publisher, or the national source for the chosen country. */
  by: string;
  q: string;
  country: string;
  region: string;
  page: number;
  pages: number;
  total: number;
  sourceTotal: number;
  rows: RankingRow[];
  countries: { code: string; name: string; count?: number }[];
  hasScore: boolean;
  scoreLabel: "score" | "rd";
  nationalBy: NationalBy[];
  edition: string;
};
