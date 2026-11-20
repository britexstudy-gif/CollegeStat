# Local data pipeline

Update, 6 October: [the new data checkpoint](DATA-DEEPENING-OCT05.md) documents implemented OpenAlex, Leiden, IPEDS aid and scoped application adapters, reproducible commands and current limitations. The October 1 overview and pending-mapping notes below describe the earlier pipeline.

As of 1 October 2026, the bundled public catalogue contains 8,985 university profiles across 175 countries. It combines the reviewed reference profiles with ROR/IPEDS identities and source-linked program, ranking and research records. Coverage of current requirements, logos and admissions remains incomplete. Identity evidence does not establish accreditation or current intake availability. Raw provider releases are not bundled.

## Layout

- `data/raw/<source>/`: downloaded versioned source files; ignored by Git.
- `data/processed/`: reproducible normalized identity candidates and review logs; ignored by Git.
- `scripts/ingestion/local-catalogue.ts`: offline normalization and conservative matching.
- `scripts/ingestion/curate-directory.py`: published ROR/IPEDS directory curation.
- `scripts/ingestion/link-rankings.py`: normalization and directory links for installed publisher tables.
- `scripts/ingestion/reconcile-ranked-identities.py`: restores missing active ROR Education identities and exact ranking joins, with a review journal.
- `supabase/migrations`: the canonical Postgres schema and publication controls.

Supported source directories are `ror`, `openalex`, `wikidata`, `scorecard`, `ipeds`, `carnegie`, `leiden`, and `discover-uni`. Convert each official release to a JSON array without changing source field meanings. Retain its original file and official dictionary. ROR v2.1 identities are normalized into unpublished candidate rows with deterministic UUIDs. Every other feed is held in a review queue until a stable identifier mapping and field dictionary are supplied. Name and domain similarity only generate possible-match suggestions; they never merge records.

```sh
npm run ingest:local -- --source ror --file data/raw/ror/release.json --release-url https://zenodo.org/records/RELEASE_ID --license-note CC0-1.0
```

The output in `data/processed` records source URL, retrieval time, source record ID, license note, proposed universities, and uncertain matches. Re-running a release yields the same CollegeStat IDs. Review and link identifiers before importing observations. Existing `ingest:ror` can stage ROR candidates in Supabase's private queue; it does not publish them.

## Source mapping order

1. ROR ID, then OpenAlex ID, Wikidata QID, IPEDS UNITID/OPEID, UKPRN/provider identifiers.
2. The candidate importer uses exact domain/name plus country as review suggestions. The published ranking reconciler accepts only a unique exact registered name or alias in the same country from the checksum-verified active ROR Education snapshot. It preserves existing IDs, official websites and campus qualifiers. Ambiguous matches remain unlinked.
3. Check editions, population definitions, missing-value codes, and permitted use. Save raw source records and reviewed normalized values separately.
4. Publish only verified records with a source link, reporting year, and licence note.

OpenAlex: map institution IDs, ROR links, works/citation counts, and topics for a stated snapshot period. Wikidata: map QIDs and Commons file IDs with creator, licence URL, and attribution. Scorecard and IPEDS: use reporting-year dictionaries and suppress missing-value codes. Carnegie: map UNITID and edition. Leiden Open: use only the CC0 Open Edition results, its university identifiers, edition, indicator, field, and period. Discover Uni: map UKPRN and course identifiers using its published specification. These source-specific field mappings are still pending; the local command stages non-ROR inputs for review rather than guessing column meanings.

The candidate command described above is distinct from the already installed public snapshots. See `docs/CURRENT-DATA-2026-09.md` for their dictionaries, scope and original dates.

## Rebuild directory and ranking joins

1. Retain the official source files used by `link-rankings.py`, including QS spreadsheets/PDF, THE JSON, ARWU JSON and `data/raw/ror/v2.13-2026-09-22-ror-data.zip`. The ROR ZIP must match MD5 `a935217de21e7983b977f5419f1a6b20`.
2. Rebuild identities with `npm run ingest:global`. This step requires the installed IPEDS releases and dictionaries, including COST1_2024.
3. With Python `openpyxl` and `pypdf` available, run `npm run ingest:rankings:link`. It links the tables, then restores missing ranked identities. To rerun just reconciliation, use `python3 scripts/ingestion/reconcile-ranked-identities.py`.
4. Inspect `data/published/ranking-identity-reconciliation.json`, `ranking-unmatched.json` and both manifests. Run domain and HTTP checks before exporting a new import bundle.

The 1 October reconciliation added 648 identities and restored 1,146 ranking joins. Repeated runs produce the same IDs and joins. It leaves 384 unmatched or ambiguous rows available in the publisher table. No publisher positions, bands, ties, scores, source URLs or original retrieval dates are changed. Registry aliases retain campus qualifiers; removing them can incorrectly merge a medical school with its parent university. New identities use deterministic UUIDs based on their ROR URL.

## Programs and requirements

Programs discovery separates official university listings from historical IPEDS completed qualifications. Search, degree and A–Z filters operate on those typed records. Historical completions are never translated into an open intake. University-specific application summaries keep their student/degree scope, source and check date. Missing thresholds are shown as questions to confirm, not inferred scores. Closed cycles remain labeled with their original dates.

## Rankings use

[QS terms](https://www.topuniversities.com/terms-conditions), [QS user agreement](https://www.topuniversities.com/user-agreement), [THE terms](https://www.timeshighereducation.com/website-terms-of-use), and [ShanghaiRanking's ownership statement](https://www.shanghairanking.com/about-sr) do not give this project a safe basis for bulk scraping and republishing their full tables. The `ranking_sources` and `external_rankings` tables store edition names, links, mappings, and any separately licensed fields. No credentials or positions are invented. [Leiden Open Edition resources](https://open.leidenranking.com/resources) explicitly offer CC0 results; reviewed observations may be imported from that edition.

## CollegeStat scores

`collegestat_scores` supports six independent dimensions: research, affordability, outcomes, selectivity, international accessibility, and scholarships. A future versioned configuration will define each input metric, normalization, direction, and weight. A score remains unpublished until at least half its weighted evidence is present; missing data is never treated as zero. No overall score is populated by this migration.
