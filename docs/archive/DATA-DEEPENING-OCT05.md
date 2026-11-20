# CollegeStat data deepening — 5–6 October 2026

This pass adds sourced observations to the existing identity catalogue. It keeps stable IDs, source revisions, applicant populations, reporting periods and historical records. It does not turn sparse profile coverage into a claim that all 9,000 universities have current admissions or financial data.

## Verified hosted checkpoint

The coordinating agent verified these Supabase counts on 6 October. The local audit below is independent of that remote check; it cannot prove a database deployment.

| Dataset | Verified hosted total | Scope |
| --- | ---: | --- |
| Universities | 9,000 | Includes 15 reviewed additions from the ROR identity expansion |
| University identifiers | 18,731 | Backfilled from existing identities; ambiguous keys excluded from automatic joins |
| Requirements | 79 | Includes 44 new scoped observations for 9 universities |
| Application deadlines | 20 | Includes 10 new rounds for 5 universities |
| Programmes | 190 | Hosted programme catalogue; not equivalent to the 189 local official route records |
| OpenAlex research metrics | 1,119 | 12 universities, 18 source-response versions |
| Leiden scientific-impact metrics | 7,158 | 2,386 universities; includes 5 existing correct observations and 7,153 additions |
| Combined research metrics | 8,277 | OpenAlex and Leiden remain separate providers and metrics |
| Private pending IPEDS aid records | 44,600 | 2,469 universities; zero approved records and zero anonymous-visible records |

The Leiden anonymous RLS query returned the same 7,158 verified records. The final financial-aid checkpoint verified all 44,600 private pending `source_records` on 2,469 universities, zero approved records and zero anonymous-visible records. Its ignored remote receipt is `outputs/application-aid-remote-receipt.json`, including the source hashes. These aid records are not public financial facts.

## Admissions and application evidence

`reviewed-requirements-oct05.json` contains 44 observations from 14 official sources. They cover IELTS, TOEFL, SAT/ACT and other documented routes, with the exact test scale and applicant category. A requirement for one programme or applicant route is not presented as a university-wide minimum. Conditional alternatives retain `required: null`; conditional admission is not converted into guaranteed eligibility.

The new records separate the policy's cycle from the date CollegeStat checked it. Twenty-three policies do not explicitly state a reporting period; the receipt leaves that field absent rather than inventing a cycle from the retrieval date. The full 79-record collection still has 31 older rows without the newer structured scope/publication-year fields. Their official links and check dates remain available; those gaps are visible in the audit.

`reviewed-application-rounds-oct05.json` adds 10 rounds for HKUST, CUHK, Aalto, ETH Zurich and Nazarbayev University, plus four application fees in HKD, EUR and KZT. Fees apply to the documented route and are not annual tuition. Date-only cutoffs remain dates. Exact instants retain their timezone; no midnight is invented when the source gives only a date. ETH's stated cutoff is not silently changed from morning to evening. CUHK's direct guide fetch was unavailable, so the official indexed guide was corroborated against the official FAQ; the receipt preserves that limitation. Past UCA/WIUT cycles and a WIUT announcement giving only a month were excluded from precise upcoming deadlines.

Two programme additions have different scopes: the requirements receipt links a Nazarbayev Computer Science bachelor's programme; the application-round receipt links its Executive MBA. An Executive MBA intake is not an undergraduate admissions deadline. The local `official-programs.json` has 189 route records on four exact institution domains; this is a different coverage measure from the hosted `programs` table's 190 rows.

## OpenAlex research history

`reviewed-openalex-metrics.json` retains 1,119 facts from 18 source-response versions for 12 exact institution identities. Its 21 excluded source rollups have future or invalid years. Counts include all-years indexed works/citations, annual indexed works, annual open-access works and topic counts. These describe OpenAlex's bibliographic coverage, not a university quality score. **Yearly citation counts are provider rollups, not citations received in that calendar year.** A retrieval-year series is labelled partial in the UI.

The normalizer now requires an exact numeric OpenAlex institution ID, matching canonical ROR, the institution's HTTPS OpenAlex lookup URL, a timezone-bearing retrieval timestamp and a 64-character SHA-256 checksum. A cache body must match that checksum before it can be imported. Invalid year types are rejected before sorting, invalid counts are omitted rather than turned into zero, and duplicate valid years cannot silently overwrite one another.

The default adapter reads both the original and dated source caches. Refreshes use the actual current retrieval timestamp and exclusive file creation; an older body or metadata file is never overwritten. A changed source hash creates a distinct stable evidence ID. Read-only tests reproduced all 1,119 stored records exactly, including IDs and metadata. Source response order does not alter the set of excluded rollups. No papers or full text were copied.

OpenAlex exposes these data under [CC0](https://help.openalex.org/access/overview/). Original API lookup URLs and dictionary links are retained per observation.

## Leiden scientific impact

The [official Leiden Open Edition 2025 dataset](https://doi.org/10.5281/zenodo.17473224) and its cached [Zenodo metadata](https://zenodo.org/api/records/17473224) establish CC0 reuse. This import uses All sciences, fractional counting and core publications from 2020–2023, with citations observed through the end of 2024. The source's `p`, `p_top_5` and `pp_top_5` headers determine the metric meaning and units. A value such as `11.3%` stays 11.3 percent.

Of 2,773 source institutions, 2,386 matched an existing unique ROR through the official crosswalk with country agreement. The remaining 387 stay in review: 371 lack an existing ROR identity, 5 lack an unambiguous official crosswalk and 11 have country conflicts. Names were not fuzzy-matched.

There are 7,153 new observations and 5 already correct observations, yielding 7,158 hosted Leiden metrics. **No ordinal university rank is created.** The source row's sort order and numeric provider ID are not overall ranks.

Ten earlier pilot observations had top-5% scientific-impact fields incorrectly labelled as international collaboration. Their original values/IDs are retained for history and held from verified public display. Correct observations have separate stable metric IDs; the previous records are not overwritten or relabelled in place.

## Financial-aid staging and Scorecard support

The [NCES SFA2324 survey](https://nces.ed.gov/ipeds/complete-data-files/SFA2324.zip) and [cached official dictionary](https://nces.ed.gov/ipeds/complete-data-files/SFA2324_Dict.zip) support 44,600 candidate observations on 2,469 existing institutions. This is the provisional **2023–24 reporting period**, not 2026 data because the files were retrieved in September 2026. Both original file hashes and retrieval timestamps remain in the receipt. NCES offers [public-use data for research and analysis](https://nces.ed.gov/ipeds/use-the-data).

Nineteen fields retain the dictionary's units and recipient populations. Only `R` (reported) and `Z` (implied zero) flags pass the selected publication rule. Missing, suppressed, negative, imputed, generated and corrected values are excluded; missing data does not become zero. Fourteen duplicate UNITID identities are explicitly excluded from automatic joins.

These observations are **private pending source records**, not automatically published canonical financial facts. Recipient averages are historical measures, not promised awards, international-student eligibility or tuition. This SFA release does not supply the former net-price fields; no net-price coverage is claimed from it.

The Scorecard adapter has expanded support backed by the cached [official dictionary](https://collegescorecard.ed.gov/files/CollegeScorecardDataDictionary.xlsx): admissions, SAT/ACT quartiles, tuition, separate public/private net-price fields and two distinct graduation populations. The current definitions file contains 17 fields, including debt and earnings definitions. Each supported import field uses the actual file-specific cohort. An unknown cohort is refused. This expands adapter support, **not the number of newly fetched Scorecard observations**. The current official documentation request returned 403; the previously retrieved September dictionary and its SHA-256 remain the evidence, without a fabricated new retrieval date.

## Coverage that remains incomplete

The deterministic local audit reports 175 countries and 8,186 ROR-linked profiles. There are 923 public and 1,918 private institutions with recorded classifications; 6,159 remain unknown. A private institution is not inferred from its name or country, and unknown records must not enter either filtered top list.

Requirements cover 20 catalogue identities; deadlines cover 11. The ranking files retain 5,197 publisher rows, including 377 unmatched entries. Current tables include QS 2027 (1,504), THE 2026 (2,191) and ARWU 2026 (1,000); the QS 2026 history contains 502 rows and is partial. The 85 regional positions are a sourced selection, all matched to exact profile hosts; this is not a full regional table. A regional rank is never calculated from a filtered world list.

There are 778 attributed media assets on 551 profiles within 628 enriched profiles: 503 campus images and 275 logos. Their source, creator, licence and licence URL are retained. Fifty-six assets identify the creator as unknown; that does not create new reuse permission. Logos are identity assets, not an endorsement. Unlicensed or explicitly disallowed media must not be promoted simply to increase image coverage.

## Reproducible checks

These commands read local files. Raw caches and generated SQL/reports remain ignored. The audit writes only inside `outputs/`; it rejects a dataset output path. The same inputs and explicit `--as-of` date produce the same report bytes.

```sh
python3 scripts/ingestion/audit-data-quality.py --as-of 2026-10-06 --out outputs/quality-report-oct05.json
python3 -m unittest discover -s tests -p 'test_*.py'
python3 scripts/ingestion/append-reviewed-requirements-oct05.py
python3 scripts/ingestion/validate-reviewed-application-rounds-oct05.py
python3 scripts/database/deeper-data.py
```

The audit includes input SHA-256 hashes, coverage, exact identity conflicts, source/check-date gaps, reporting contexts and receipt-count comparisons. The October checkpoint has zero duplicate-record, orphaned-identity or receipt-count integrity issues. Coverage warnings are intentionally retained. `deeper-data.py` generates bounded inspectable SQL; it neither connects to Supabase nor proves that SQL ran. Do not run `openalex-metrics.py` merely to validate: it writes a publication receipt. The Python tests perform the cache rebuild without writing it.

Database installation and RLS checks are separate from the local receipt. The final financial-aid staging counts above were verified remotely; later source refreshes should be recorded as new checkpoints, keeping the earlier evidence and dates intact.
