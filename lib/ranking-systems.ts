/** Publisher identity, local availability and reuse permission are distinct facts. */
export type RankingAvailability =
  | "imported"
  | "partial"
  | "external"
  | "restricted"
  | "source-review"
  | "reviewed";
export const rankingSystems = [
  {
    slug: "qs",
    name: "QS World University Rankings",
    shortName: "QS",
    category: "Reputation, research and employability",
    url: "https://www.topuniversities.com/world-university-rankings",
    imported: true,
    availability: "imported",
    edition: "2027",
    coverage: "World table and separately sourced regional selections",
    reuse:
      "Existing source receipts; review permission for each additional edition",
  },
  {
    slug: "the",
    name: "Times Higher Education",
    shortName: "THE",
    category: "Teaching and research indicators",
    url: "https://www.timeshighereducation.com/world-university-rankings",
    imported: true,
    availability: "imported",
    edition: "2026",
    coverage: "World table; published ties and bands preserved",
    reuse:
      "Existing source receipts; no new redistribution permission established",
  },
  {
    slug: "arwu",
    name: "ShanghaiRanking · ARWU",
    shortName: "ARWU",
    category: "Research achievement and publications",
    url: "https://www.shanghairanking.com/rankings/arwu/2026",
    imported: true,
    availability: "imported",
    edition: "2026",
    coverage: "World table; published rank bands preserved",
    reuse:
      "Existing source receipts; no new redistribution permission established",
  },
  {
    slug: "leiden",
    name: "CWTS Leiden Ranking Open Edition",
    shortName: "Leiden Open",
    category: "Scientific impact, with explicit counting methods",
    url: "https://open.leidenranking.com/",
    imported: true,
    availability: "partial",
    edition: "2025",
    coverage:
      "Selected scientific-impact indicators; no composite overall rank",
    reuse: "CC0 results and underlying data",
  },
  {
    slug: "herd",
    name: "NCSES Higher Education Research and Development",
    shortName: "NCSES HERD",
    category: "US institutions · total research expenditure",
    url: "https://ncses.nsf.gov/pubs/nsf26304",
    imported: true,
    availability: "imported",
    edition: "FY2024",
    coverage:
      "796 published profile positions; 925 original source positions retained",
    reuse:
      "Attributed NCSES statistics; exact identity review published 10 October 2026, combined reporting units remain pending",
  },
  {
    slug: "nirf",
    name: "NIRF India Rankings",
    shortName: "NIRF India",
    category: "India · 17 separate institutional and subject categories",
    url: "https://www.pib.gov.in/PressReleasePage.aspx?PRID=2163711&lang=1&reg=3",
    imported: true,
    availability: "imported",
    edition: "2025",
    coverage:
      "59 published profile positions across 13 categories; 114 Ministry-selected source positions retained",
    reuse:
      "Attributed PIB Ministry-authored ordinal results; exact identity review published 10 October 2026, full publisher tables are outside this permission",
  },
  {
    slug: "cwur",
    name: "Center for World University Rankings",
    shortName: "CWUR",
    category: "Education, employability, faculty and research",
    url: "https://cwur.org/2026.php",
    imported: true,
    availability: "imported",
    edition: "2026",
    coverage: "Top 2,000 world positions with country positions, each linked to the publisher",
    reuse: "Copyright notice; open redistribution permission not established",
  },
  {
    slug: "usnews",
    name: "U.S. News Best Global Universities",
    shortName: "U.S. News",
    category: "Global academic research and reputation",
    url: "https://www.usnews.com/education/best-global-universities",
    imported: false,
    availability: "external",
    edition: null,
    coverage: "Publisher reference; positions have not been imported",
    reuse:
      "Current terms could not be verified; no import permission established",
  },
  {
    slug: "time",
    name: "TIME · World's Top Universities",
    shortName: "TIME / Statista",
    category: "Academic performance, innovation and global engagement",
    url: "https://time.com/7346375/worlds-top-universities-methodology-2026/",
    imported: false,
    availability: "external",
    edition: "2026",
    coverage: "Publisher methodology and results; no positions imported",
    reuse:
      "Publisher reference only; redistribution permission not established",
  },
  {
    slug: "urap",
    name: "University Ranking by Academic Performance",
    shortName: "URAP",
    category: "Publication and citation performance",
    url: "https://urapcenter.org/",
    imported: true,
    availability: "imported",
    edition: "2025–2026",
    coverage: "Top 3,000 world positions from the overall table, linked to the publisher",
    reuse:
      "All rights reserved; open redistribution permission not established",
  },
  {
    slug: "scimago",
    name: "SCImago Institutions Rankings",
    shortName: "SCImago",
    category: "Research, innovation and societal impact",
    url: "https://www.scimagoir.com/methodology.php",
    imported: false,
    availability: "restricted",
    edition: "2026",
    coverage: "Publisher reference; no positions imported",
    reuse:
      "Prior written authorization required for reproduction and distribution",
  },
  {
    slug: "unirank",
    name: "uniRank · University directory and web popularity",
    shortName: "uniRank",
    category: "Non-academic web popularity; university directory",
    url: "https://www.unirank.org/",
    imported: true,
    availability: "partial",
    edition: "2026",
    coverage:
      "Five university-reported positions for three institutions; full publisher tables are not imported",
    reuse:
      "Individual factual positions attributed to official university announcements. No uniRank directory scraping or table republication. Publisher terms: https://www.unirank.org/terms/",
  },
  {
    slug: "webometrics",
    name: "Webometrics · Ranking Web of Universities",
    shortName: "Webometrics",
    category: "University web visibility, openness and scholarly impact",
    url: "https://doi.org/10.6084/m9.figshare.33062150.v3",
    imported: true,
    availability: "partial",
    edition: "July 2026",
    coverage:
      "2,250 public positions across 220 country and publisher-region groups; 1,776 exact profile matches. Public top-15-per-country selection; not the full table",
    reuse:
      "Isidro F. Aguillo · Cybermetrics Lab (IPP-CSIC), July 2026 corrected v3 author release, CC BY 4.0; attribution and original positions retained",
  },
] as const;
export type RankingSystem = (typeof rankingSystems)[number];
export type RankingSystemSlug = RankingSystem["slug"];
export function rankingSystemHref(system: RankingSystem) {
  return system.imported
    ? `/rankings?${system.slug === "herd" || system.slug === "nirf" ? "scope=national&" : ""}provider=${system.slug}`
    : system.url;
}

/** General university tables precede specialist research measurements. */
export function rankingSystemOrder(slug: RankingSystemSlug) {
  return [
    "qs",
    "the",
    "webometrics",
    "unirank",
    "nirf",
    "cwur",
    "usnews",
    "time",
    "arwu",
    "leiden",
    "herd",
    "urap",
    "scimago",
  ].indexOf(slug);
}
