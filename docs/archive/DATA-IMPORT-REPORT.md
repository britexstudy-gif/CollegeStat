# Public data import report

Generated from the bounded local pilot retrieved on 2026-09-25. Raw downloads are kept under `data/raw/<source>/` and are ignored by Git. `data/processed/installed.json` is the complete review artifact. `data/published/imported.json` is the small reviewed subset used by local reference mode.

| Source | Release or response | Imported | Rejected | Uncertain | Live use |
| --- | --- | ---: | ---: | ---: | --- |
| ROR | API v2.1 responses for six catalogue universities | 24 records / 6 universities | 0 | 0 | Profile identifiers, aliases, domains, official links, founding year, city identity, and city-level coordinates |
| OpenAlex | Institution API snapshot, 2026-09-25 | 72 records / 6 universities | 11 invalid future/sentinel year rows | 0 | Profile Open data tab: works, citations, and topics with observation year |
| Wikidata / Commons | EntityData and imageinfo responses, 2026-09-25 | 32 records / 6 universities | 0 | 0 | Identifiers and official links are live; media candidates remain in review with creator and license metadata |
| College Scorecard | 2023 API fields with the 2026-06-10 dictionary | 30 records / 2 universities | 0 | 0 | MIT and Stanford admissions, SAT/ACT, undergraduate enrollment, tuition, net price, completion, Pell share, and field shares in Open data |
| IPEDS | 2023 HD, IC, EFFY, C, and S survey files and annual dictionaries | 395 records / 2 universities | 0 | 0 | MIT and Stanford identity, OPEID, location, charges, enrollment, CIP completions, and instructional staff; flags and cohort labels are retained |
| Carnegie | 2025 public data file | 6 records / 2 universities | 0 | 0 | Local review report only because the published license is CC BY-NC-SA 4.0 |
| Leiden Open Edition | 2025, all sciences, 2020–2023, core publications, fractional counting | 15 records / 5 universities | 0 | 1 unmatched catalogue university | Rankings page and profile Open data tab |
| Discover Uni | 2025/26 official download page | 0 | 0 | 0 | Blocked: the official HESA download returned HTTP 403 from this environment. Adapter directory and source contract remain ready; no data was invented. |

The imported count is the number of normalized factual records, not the number of rows in each global release. The pilot intentionally targets the six existing catalogue identities and the two US institutions with stable UNITID mappings. The fetcher and streaming IPEDS readers can process larger releases without committing raw archives.

Scorecard values are accepted only when their developer field is present in the official dictionary and the release-specific cohort map supplies a definition. IPEDS values preserve the annual survey field, item imputation flag, reporting period, and cohort. Missing and privacy-suppressed values are absent rather than stored as zero.

QS prohibits automated scraping in its user agreement. THE asks users to obtain permission before reproducing or distributing ranking data. ShanghaiRanking states that it owns ARWU publication and copyright and provides no clear redistribution permission for its tables. CollegeStat therefore stores publisher names, official links, edition metadata, and optional licensed adapter structure only. Leiden Open is handled separately under CC0.

The scoring definition is versioned in `data/scoring-framework-v1.json`. It defines research, affordability, outcomes, selectivity, international accessibility, and scholarship availability, including direction, normalization bounds, weights, and a 50% evidence threshold. It explicitly disables an overall score. A dimension stays unpublished until the required coverage and real sourced inputs are available.
