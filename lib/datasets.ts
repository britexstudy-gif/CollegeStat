export const datasets = [
  {
    id: "qs-regional",
    name: "QS regional rankings & institutional profiles",
    scope:
      "Asia, Europe, Arab Region, Sub-Saharan Africa, Latin America & Caribbean",
    fields:
      "Publisher positions, ties, edition, source URL; selected institutional facts and ranking history",
    url: "https://www.topuniversities.com/university-rankings",
    download: "https://www.qs.com/solutions/datasets",
    access: "Published by QS · rankings are free to view on the QS website",
    integration:
      "85 sourced positions across five partial regional editions · 2026 and 2027",
    caveat:
      "This is a partial sourced selection, not complete regional coverage. A published band cannot be converted to an exact rank; underlying profile statistics may have no reporting year.",
  },
  {
    id: "ror",
    name: "Research Organization Registry",
    scope: "Global institution identities",
    fields:
      "Names, aliases, country, official website, persistent ROR identifiers",
    url: "https://ror.org/registry/",
    download: "https://doi.org/10.5281/zenodo.6347574",
    access: "CC0 · public JSON / CSV releases",
    integration:
      "ROR 2.13 · 22 September 2026 release installed; earlier registry evidence preserved",
    caveat:
      "Research organizations are not a complete list of universities. Every proposed identity is reviewed before publication.",
  },
  {
    id: "scorecard",
    name: "College Scorecard",
    scope: "United States",
    fields:
      "Admissions, undergraduate enrollment, completion, residency tuition, net price, Pell share, SAT sections and ACT percentiles",
    url: "https://collegescorecard.ed.gov/data/api/",
    download: "https://collegescorecard.ed.gov/data/",
    access: "US Department of Education · free to explore on the College Scorecard website",
    integration:
      "15 dictionary-backed fields supported in bounded refresh feeds; imports stay private pending review. No new API observations claimed.",
    caveat:
      "Exact reporting-year cohorts and IPEDS identifiers are required. Missing and suppressed values stay absent. Percentiles are not entry minima; net price and Pell share do not establish international eligibility.",
  },
  {
    id: "ipeds",
    name: "Integrated Postsecondary Education Data System",
    scope: "United States",
    fields:
      "Institution directory, admissions, enrollment, tuition, financial aid, completions and graduation",
    url: "https://nces.ed.gov/ipeds/use-the-data",
    download: "https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx?rtid=1",
    access: "NCES · downloadable survey files and dictionaries",
    integration:
      "Admissions and programme / enrolment releases retained; 44,600 verified SFA 2023–2024 observations across 2,469 institutions published with exact survey populations and source evidence",
    caveat:
      "Public-use SFA data retains survey populations, years and reporting flags. Fourteen ambiguous UNITIDs were held from matching. Recipient averages are reported outcomes, not promised awards or international eligibility.",
  },
  {
    id: "openalex",
    name: "OpenAlex",
    scope: "Global research activity",
    fields: "Institution IDs, annual works, citations, and research topics",
    url: "https://openalex.org/",
    download: "https://help.openalex.org/",
    access: "CC0 · official API and snapshot",
    integration:
      "1,119 dated research observations across 12 institutions added; existing research identities and paper coverage on 847 profiles retained",
    caveat:
      "Institution attribution and counts can change as the open index is updated. Observation years remain visible.",
  },
  {
    id: "wikidata",
    name: "Wikidata & Wikimedia Commons",
    scope: "Global enrichment and reusable media",
    fields: "QIDs, official links, coordinates, images, creators, and licenses",
    url: "https://www.wikidata.org/",
    download: "https://commons.wikimedia.org/",
    access: "Wikidata CC0 · each Commons file has its own license",
    integration: "616 enriched profiles; media attribution retained per file",
    caveat:
      "Media stays in review until attribution, creator, license, and reuse status are confirmed.",
  },
  {
    id: "carnegie",
    name: "Carnegie Classifications",
    scope: "United States",
    fields:
      "2025 institutional, access and earnings, and research classifications",
    url: "https://carnegieclassifications.acenet.edu/",
    download: "https://carnegieclassifications.acenet.edu/data-center/",
    access: "CC BY-NC-SA 4.0",
    integration: "2025 public file installed in the local review report",
    caveat:
      "Normalized records are held from public app distribution while commercial reuse remains unresolved.",
  },
  {
    id: "leiden",
    name: "CWTS Leiden Ranking Open Edition",
    scope: "Global research indicators",
    fields:
      "Scientific impact: fractional core publications P, top-5% publication counts P(top 5%), and their share PP(top 5%)",
    url: "https://open.leidenranking.com/",
    download: "https://open.leidenranking.com/resources",
    access: "CC0 · Open Edition results",
    integration:
      "7,158 sourced impact observations across 2,386 institutions · 2025 Open Edition, 2020–2023 publication cohort",
    caveat:
      "All-sciences, fractional, core-publication scope; citations observed through 2024. These are impact indicators, not international-collaboration statistics or an overall university rank. Indicator sort order never becomes a numeric quality rank.",
  },
  {
    id: "discover-uni",
    name: "Discover Uni",
    scope: "United Kingdom providers and courses",
    fields:
      "UKPRN, course identity, entry, continuation, outcomes, and student experience",
    url: "https://discoveruni.gov.uk/",
    download: "https://www.hesa.ac.uk/support/tools-and-downloads/unistats",
    access: "CC BY 4.0 · official archive currently returned HTTP 403",
    integration: "Adapter contract ready; no records installed",
    caveat:
      "Access was blocked from this environment, so CollegeStat does not claim Discover Uni coverage.",
  },
] as const;
