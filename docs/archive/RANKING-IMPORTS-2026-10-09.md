# Actual national ranking snapshots — 9 October 2026

This pass integrates **two additional source-backed ranking datasets** in the national source-preview UI and stages them in the hosted private review queue. It does not change QS/THE/ARWU positions or manufacture a Leiden composite rank. The product has six data-backed systems: QS, THE, ARWU, Leiden Open indicators, NCSES HERD research expenditure positions and selected NIRF India category results. They have different scopes and cannot be presented as six equivalent global overall rankings.

## Added facts and coverage

| Snapshot | Actual positions | Existing profile links | Distinct existing profiles | Coverage |
| --- | ---: | ---: | ---: | --- |
| NCSES HERD FY 2024 Table 6 | 925 | 801 | 801 | Complete published table of US/outlying-area research-expenditure positions; 44 totals carry the provider's imputation flag |
| Ministry-authored PIB NIRF 2025 results | 114 | 59 | 33 | Selected top 3/5/10 results in 17 categories; **not** the full NIRF top-100 tables |
| Total | 1,039 | 860 | 834 | All source positions remain available, including institutions awaiting an exact profile match |

The raw snapshots were already cached on 6 October. Their original retrieval dates and SHA-256 receipts are retained. The unfinished adapter failed when blank NCSES identifiers collapsed nine unrelated public-use records. It now uses each public-use `inst_id` as a distinct fallback and never uses a missing identifier as a shared key. Source rank, ties, raw table fields, scope, population, reporting year, publication date, source URL, retrieval date, permission URL/hash and evidence are retained per observation.

The table above describes the immutable original receipt. A separate reviewed identity projection now links three NIRF positions to three newly published university routes: NIRF becomes 62 linked positions/36 profiles and the combined preview becomes 863 linked positions/837 profiles. `national-ranking-search.json` holds the three reviewed links and canonical search names without rewriting original publisher facts. Original hosted staging remains 860 entries; the projection is not an automatic verification or publication of pending DB entries.

The nine HERD combined reporting units remain unlinked. A university profile must not inherit expenditure/rank figures for an aggregate that includes multiple campuses or a medical centre. Puerto Rico, Guam and the U.S. Virgin Islands retain their source location labels within the broader HERD US/outlying-area edition. HERD is a research expenditure comparison, not an overall university quality ranking. [Official methodology and tables](https://ncses.nsf.gov/surveys/higher-education-research-development/2024).

## Source permission and attribution

The HERD data tables are official NCSES/NSF statistical publications. NSF's reuse policy allows copying government-produced text and downloadable publications unless specifically identified as copyrighted. The receipt includes the complete original policy snapshot and its hash. **No NSF logos, photographs or visual media are imported under this text permission.** Attribution: “National Center for Science and Engineering Statistics, U.S. National Science Foundation, Higher Education Research and Development Survey FY 2024.” [NSF reuse policy](https://www.nsf.gov/policies/digital).

PIB allows accurate, prominently attributed reuse of its own material; this permission excludes third-party material. This adapter uses only the Ministry-authored names and ordinal results in its press release. It excludes underlying Scopus/Web of Science/patent inputs, photographs and the unreproduced full NIRF category tables. Attribution: “Government of India, Ministry of Education / Press Information Bureau, India Rankings 2025, 4 September 2025.” [PIB copyright policy](https://www.pib.gov.in/ContentPage.aspx?lang=2&menuid=102&reg=48), [official release](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2163711&lang=1&reg=3).

The separate identity proposal receipt uses the installed immutable ROR v2.13 release, whose official ZIP checksum is validated. ROR identifiers and metadata are CC0; its GeoNames location metadata carries CC BY 4.0 attribution. Registry membership is not accreditation or proof of a current degree, tuition, admission requirement, official logo or ownership type. [Official ROR release and licence](https://zenodo.org/records/22902037).

## Missing ranked institutions

`data/published/reviewed-national-ranking-identities.json` retains the original **10 exact active education ROR identity proposals covering 12 positions**, plus **8 exact existing-ROR position matches**. Three reviewed university identities—Shri Vishwakarma Skill University, Symbiosis University of Applied Sciences and Nalsar University of Law—were appended locally and published insert-only to hosted Supabase. Seven institute/college proposals remain held. The bundled and hosted counts are now 14,003/212 countries. Original proposals, registered websites, source URLs, ROR release/checksums and deterministic IDs remain evidence; this is not authority to add inferred programs, ownership or logos.

The original reconciliation held 159 positions after its proposals: 103 without a unique official UNITID crosswalk, 31 without a unique exact active education ROR, 13 registered-name collisions, nine combined reporting units, two shared websites and one needing current US HD2025 corroboration. The separate three-link projection leaves 176 of the 1,039 displayed positions without a linked profile; the other original proposals are not treated as published links. Holding an ambiguous identity preserves its source ranking row.

The existing world tables still contain 377 unlinked source rows. Leiden's existing 387-item identity review also remains separate; no second copy of its 7,158 installed indicator observations is introduced. Additional coverage requires evidence for each identity, including mergers, campuses, historical names and country conflicts. The request to include every list institution does not justify pretending that an ambiguous research unit is a new independent university.

## Review before publication

The generated SQL reuses `data_sources`, `data_imports`, `source_records`, `ranking_providers`, `ranking_editions` and `ranking_entries`. This ranking import adds **zero tables or schema changes** and does not update historical facts. The separate performance pass applied two invoker-function migrations documented in [the current checkpoint](DEVELOPMENT-CHECKPOINT-2026-10-09.md).

All 14 insert-only transaction files in `outputs/national-rankings-oct09-review-final/manifest.json` were applied to hosted PostgreSQL. Independent queries confirmed **1,039 pending source records**, **860 `needs_review` ranking entries**, **18 editions with `permitted=false`**, **zero public verified entries** and **zero anonymous-visible pending entries**. `hosted-result.json` records the receipt. Existing source URLs/provider slugs/edition keys are reused and conflicts do not overwrite history.

An admin must inspect source/permission evidence and verify the national/subject scope before publication through the existing workflow. The public national source preview reads the reviewed immutable source receipt; it does not bypass private pending-record RLS. On a different authorized target, the generator writes local SQL for review before applying its manifest order. Repeated staging remains idempotent.

## Reproduction

```sh
python3 scripts/ingestion/fetch-national-ranking-sources.py --verify-cache
# On a clean checkout, omit --verify-cache to fetch the bounded official files.
python3 scripts/ingestion/fetch-national-ranking-sources.py

# Existing reviewed receipts are never silently overwritten. Use a new output
# path for an independent reproduction and compare the JSON after review.
python3 scripts/ingestion/review-national-rankings.py --reviewed-at 2026-10-09 --output outputs/national-rankings-reproduced.json
python3 scripts/ingestion/reconcile-national-ranking-identities.py --out outputs/national-identities-reproduced.json
python3 scripts/ingestion/build-national-ranking-search.py
python3 scripts/ingestion/stage-national-rankings.py --out outputs/national-rankings-oct09-review-final
python3 -m unittest discover -s tests -p test_national_rankings.py
node --import tsx --test tests/national-ranking-staging.test.ts
```

Ten focused Python tests pass: source integer precision/suppression, campus names, aggregate boundaries, provenance, imputation/ties, territorial labels, category scope, private/idempotent staging, exact source reproduction and identity proposal guards. The complete Python suite passes **66 tests**. Six national UI/domain checks cover category/search/position preservation and reviewed linking. A PostgreSQL/PGlite integration test executes all 14 generated SQL transactions under the installed migrations, repeats them without changing historical rows, verifies existing source URL/metadata reuse and proves anonymous/non-admin users cannot read or publish pending records. Hosted denial/count checks and actual national UI/profile navigation also passed.

CWUR, SCImago, URAP, U.S. News and Webometrics remain subject to the specific source restrictions in [the 8 October source review](RANKING-SOURCES-2026-10-08.md). They are not imported under an assumed permission. In particular, CSIC's Webometrics project and the independently operated `webometrics.org` cannot be silently merged into one publisher.
