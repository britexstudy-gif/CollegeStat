# CollegeStat data and resource plan — 13 October 2026

## Audit boundary and conclusion

The next useful expansion is deeper, current, applicant-specific evidence on existing institutions, followed by better resource maintenance. Adding a second copy of the identity directory or a larger publisher-reference list would not address that gap.

This audit read public catalogue snapshots, ingestion and publication scripts, schema definitions, dated hosted receipts, and the Articles/Library implementation. It ran one offline financial-aid dry run and checked a few primary resource references. It did not access credentials, account or student contents, execute hosted SQL, change schema/runtime/catalogue files, run external Muse, or publish a dataset. Hosted counts below are the existing dated verification baseline, not a new authenticated database measurement.

Current authority: [12 October checkpoint](DEVELOPMENT-CHECKPOINT-2026-10-12.md), [11 October data ledger](DEVELOPMENT-CHECKPOINT-2026-10-11.md), and the specific publication receipts below. Earlier checkpoints remain history.

## What is actually installed or published

| Coverage | Audited state | Evidence and interpretation |
| --- | --- | --- |
| Institution identities | 14,003 local records / 212 countries; same published total in the latest checkpoint | `data/published/global-directory.json` and `directory-manifest.json`. File SHA-256 matches the manifest: `2430768a8a5112babf3ebbffaddb8e71cb2b45465c7844743ba90eabcee06c4c`. ROR identity is not accreditation, ownership or a complete admissions profile. |
| Current official offers | Latest hosted verification: 195 offers | Five independently reviewed offers were added to the established 190. `data/published/reviewed-programmes-oct10.json` and `outputs/current-programmes-staging-oct10/publication-receipt.json`; generic WIUT Economics remains held. |
| Local official route list | 185 rows on three domains: TUM 183, WIUT 1, Nazarbayev 1 | Actual `official-programs.json` count. This is a separate representation from hosted offers and the five-offer reviewed overlay. Do not equate, add or silently reconcile these totals without stable offer IDs. |
| Historical completed qualifications | 148,432 records / 2,731 institutions | Actual `program-catalogue.json` matches the manifest counts; period July 2024–June 2025. The manifest hash describes the source ZIP, not the generated JSON. Completion evidence does not establish an advertised degree or open intake. |
| Requirements | 75 local verified rows / 19 university IDs; latest hosted baseline 75 | Five rows have a `program_id`; 55 have no `year`; 44 carry structured scope/population evidence and explicitly are not university-wide. The other 31 lack that structured evidence. Unknown periods must remain unknown. |
| Admissions / costs / deadlines | Latest baseline: 967 / 4,553 / 20 observations | Stored observations rather than covered institutions or guaranteed current conditions. Currency, population, period and source must travel with each value. |
| Existing IPEDS aid | 44,600 public canonical facts / 2,469 institutions / 19 metrics | `outputs/reviewed-aid-publication-oct09/result.json` verifies publication, exact links and value parity. SFA2324 is **2023–24 provisional**. A recipient average is neither a promised award nor international eligibility. |
| Unused SFA fields | 59,829 prepared candidates / 2,469 existing identities / 27 distinct unused fields | `outputs/ipeds-aid-extension-oct11/manifest.json`. The 13 October offline dry run independently reproduced the counts and signatures with zero existing fields reimported, new profiles, publications or hosted writes. These are not additional public facts. |
| Graduation outcomes | 20,596 candidate facts / 2,273 institutions, held | `reviewed-ipeds-graduation-outcomes.json` is physically under `data/published` but has `review_only_receipt` status. The cohort review keeps entry years null, identifies conflicting 2017/2020 versus 2018/2021 labels and missing fall/full-year reporter scope, and publishes zero derived rates. |
| Global publisher rankings | Original QS 2027 / THE 2026 / ARWU 2026 values and history retained | Manifest: 4,820 linked and 377 unresolved across retained observations. Preserve positions, bands, ties, edition, source and original retrieval date. A missing match is not a new institution or rank. |
| Leiden / OpenAlex | Reviewed snapshot: 7,158 selected Leiden indicators / 2,386 identities; 1,119 dated OpenAlex observations / 12 identities | Earlier hosted checkpoint recorded normalized Leiden publication; this audit has not rechecked all 7,158 through the current public API. **The current Leiden table exposes five institutions**, as reconciled below. Selected research metrics retain method/window; they are not overall ranks. |
| HERD / NIRF | 855 verified public entries / 829 profiles | `national-publication-oct10.json`: HERD 796; NIRF 59; 184 source units remain pending; 14 editions enabled. Research expenditure and category positions retain their original scope. |
| CWUR / uniRank | Two restricted provider metadata rows; zero imported ranks | `data/review/ranking-provider-metadata-oct12.json`. Provider registration is not dataset installation or redistribution permission. |
| Official resource links | 19 published links: eight practice / eleven destination | Local snapshot hash matches the publication manifest: `1d1e785a53d416537e623cf106b86c348b1dbb22080a3481af1a78a470cb684a`. Five SAT, two IELTS, one TOEFL practice links; eleven scoped destination links. Zero copied question-bank items. |
| Original Articles | 16 app-authored guides across six topics | `lib/guides.ts`, `lib/article-content.ts`, `lib/article-index.ts`, [Knowledge Hub report](KNOWLEDGE-HUB-2026-10-12.md). These are source-linked editorial content, not hosted university facts or a hosted article CMS. |

The 38 emitted public Muse reports from 12 October remain unverified source candidates. Zero jobs exited successfully and zero automatic publications were made. They are not an authoritative feed, a new dataset, or evidence of successful source verification.

### Stored coverage, source universe and visible coverage are different

The coordinating agent's fresh `/rankings?provider=leiden` browser read on 13 October showed **five institutions**, and the original five reader profiles were preserved. The existing `outputs/ranking-read-oct12/catalogue-after.json` independently contains exactly those five `publications_fractional_core` profile rows: Stanford, MIT, Oxford, TUM and Toronto. This matches the implementation:

- `server/ranking-table.ts` constructs the Leiden table from `university.imported_records` with that exact metric.
- The hosted `ranking_profiles` RPC in `20261003060621_hosted_public_views.sql` exposes the legacy verified/published Leiden JSON records; it does not join the separately normalized `research_metrics` rows into the Leiden table.
- `server/leiden-metrics.ts` and `server/profile-library.ts` can attach the wider reviewed metrics by exact institution ID for the local profile library. This code path and a historical normalized DB receipt do not prove that the current public ranking projection exposes every reviewed institution.
- The reviewed source subset contains 2,773 source institutions, 2,386 matched existing IDs, 7,158 indicator values and 387 identity holds. The dated 11 October source check distinguishes that subset from the full 2,831-institution source edition. Neither source universe is the current five-institution app table.

Therefore report **five institutions in the currently checked Leiden ranking/reader projection**, a **wider 7,158-value reviewed snapshot**, and **dated normalized hosted-publication evidence** separately. A future integration must choose a canonical per-ID indicator projection, prove complete anonymous visibility and exact source parity, retain the held identities, and verify the real route before advertising wider UI coverage. Do not create ordinal ranks from the indicator sort or reimport the same observations to fix a projection.

The coordinating agent's fresh MIT Study view showed **one official programme plus 28 THE broad subject areas**. Those subject areas are publisher taxonomy rather than 28 independently verified current degrees or intakes. This concrete sparse-profile result reinforces the current-programme priority; the browser-visible quantity must not be replaced by a global DB offer count.

## Summary mismatches to resolve before reporting growth

1. `LOCAL-SETUP.md` still describes the default bundled directory as 8,985 institutions; the present local file contains 14,003. `LOCAL-DATA-PIPELINE.md` labels its 8,985 figure as a dated October 1 overview but still says several now-implemented source mappings are pending. Add a current-status pointer and retain the historical figures with their date.
2. `DATASETS.md` says an IPEDS survey adapter is not implemented; the repository now includes dictionary-backed aid, completions and graduation adapters with different publication states. Report these separately instead of claiming a generic complete IPEDS import.
3. The earlier 189-route/four-domain description in `DATA-DEEPENING-OCT05.md` differs from the current 185-route/three-domain local list. The latest 195 hosted offer count is another unit of measurement. Reconcile by `university_id` plus stable offer/programme IDs and source URLs, not arithmetic or name similarity.
4. The programme staging manifest and `data/review/current-programmes-staging-oct10.json` correctly retain the original private-only staging state. The later five-offer publication receipt supersedes that state for those exact IDs. Do not rewrite the original receipts or replay their SQL as a new release.
5. `reviewed-ipeds-aid.json` and `reviewed-national-rankings.json` retain staging-oriented status strings after separately recorded publication. Directory location or one status string is insufficient: consult the later publication receipt and exact IDs. The same rule prevents treating the held graduation file as public because it lives under `data/published`.
6. `outputs/ranking-read-oct12/catalogue-after.json` is a 3,064-profile compact ranking projection. Its empty admission/cost/requirement arrays are not a catalogue-wide absence check or the 14,003-identity directory. Use section-specific complete coverage receipts.
7. Preserve `source publication date`, `observation/reporting period`, `retrieved_at`, `reviewed_at` and `published/verified_at` as distinct dates. The directory's original September retrieval and later identity review date need not match. Global `articleCheckedAt` currently describes the editorial release, not an independently rechecked date for every linked source.

A future aggregate coverage response should expose each count with its unit, scope, snapshot date and evidence/receipt pointer. Distinguish identities, university offers, historical completion rows, source candidates, canonical facts, unique covered institutions and original articles. Keep this response public and aggregate; do not derive student activity from accounts or private work.

## Priorities for useful additions

| Priority | Work | Exact next step and release gate |
| --- | --- | --- |
| 0 | Make current summaries and UI projections reliable | Reconcile dated docs/aggregate views with the units above, and distinguish five visible Leiden profiles from the wider reviewed/normalized set. Integrate a complete indicator projection only after exact public read-back; no reimport is needed. Preserve historical receipts. |
| 1 | Current entry requirements and application costs/dates | Independently refresh the five already staged dated facts: Waterloo's three 2027 application/document dates and WIUT's two separate domestic/international 2026/27 tuition facts. Read `data/review/official-admissions-staging-oct10.json` and the evidence manifest. Hold all seven undated candidates until the exact scope is reviewable. The installed structured-review guard rejects generic numeric approval for `costs`/`deadlines`; release only through a section-specific guarded transaction with exact programme/applicant population, currency/period or date precision, source hash and conflict checks. The audited pilot contains staging SQL, not proof of a ready public structured-release generator. |
| 1 | Broader current programmes on existing IDs | Prioritize a small useful cross-country set with actual programme, award, campus, applicant route and entry-cycle evidence. The existing current-degree adapter is explicitly limited to Waterloo/WIUT and seven pages; it is not a global crawler. Add reviewed source definitions/adapters before extending scope. Advertised pages support a current offering at retrieval; they do not establish current application places. Preserve unknown language/duration/intake/year as null. Resolve the precise WIUT Economics pathway before creating any offer. |
| 1 | Repair old requirement scope | Review the 31 existing rows without structured evidence and refresh the 13 TOEFL requirement rows against exact institutional routes/test-date rules. Do not mass-convert stored 0–120 minima to 1–6 or promote a programme condition to a university-wide threshold. Work by existing row/source identity with a new evidence version. |
| 2 | Unused official aid fields | Reuse the installed SFA2324 ZIP/dictionary through `ipeds-aid-extension-oct11.py`. The already prepared 25 pending SQL batches are review artifacts. First rerun read-only hosted preflight for exact identities, duplicate metric/year/population keys and value conflicts. Then stage privately, independently review grant versus loan populations, and create a separate guarded publication artifact. Do not rerun the 44,600-fact publication or use its hard-coded generator for the extension. |
| 2 | Resource maintenance and a modest content expansion | Refresh the existing 19 links before adding duplicates. Fill genuinely missing topics after official verification, such as DET preparation/acceptance research, document recognition/translation, and scholarship renewal/budget planning. Reuse existing 16-article subject scope and check for overlap. Official material stays at the provider; create an original summary/checklist rather than reproducing tests, essays or transcripts. |
| 3 | Permitted research/identity enrichment | Extend already installed CC0 OpenAlex/Leiden selections only where exact institution identifiers, field definitions and useful profile demand exist. Reuse the present ROR registry evidence; identity expansion is lower priority than deeper profiles. Preserve existing ambiguous matches. |
| Hold | GR2024 graduation-rate publication | Obtain release-specific selector/reporter-type evidence that resolves the conflicting cohort contract. Retain the 20,596 candidates and null entry years until then. No graduation rates from arithmetic assumptions or mixed cohorts. |
| Hold | Extra publisher rankings or restricted classification | Keep THE's newer edition and CWUR/uniRank/URAP/SCImago/U.S. News as references until edition-specific reuse permission exists. Carnegie's CC BY-NC-SA status remains unresolved for public app distribution. Discover Uni has a prepared adapter contract but no installed records after blocked official access; do not claim UK course coverage. |

These are priorities and candidate scopes, not promised import totals. Existing source rows must be deduplicated before estimating additional published observations or covered institutions.

## Resource and article taxonomy

Keep the current destinations understandable and give each content type a truthful label:

| Content type | Destination / owner | Source of truth | Maintenance requirement |
| --- | --- | --- | --- |
| Original reading | Public `/articles` and dashboard article readers | `guides` + `articleDetails`, six existing topics | Original authorship, stable ID/slug, per-article revision, scope/cycle, citations, review date and related reading. |
| Official practice link | Private Library's optional study resources | Versioned `learning_resources`, `kind=practice` | Test/provider, access/account/app requirement, population, official URL, checked date; `link_metadata_only`, no copied questions. |
| Destination/qualification reference | Library admissions tools and relevant original reader | `learning_resources`, `kind=destination` | Exact country/institution example and qualification route; country examples must not become nationwide entry rules. |
| Application rehearsal/checklist | Owner-private workspace | Existing owner-scoped rehearsal/progress models | Student-entered plans and completion states, not official requirements, submissions or admission predictions. |
| Certificates/test results | Owner-private profile | Existing qualifications/test-attempt models | Self-reported evidence and exact test scale/date; never public resource catalogue entries. |
| Programme or statistical fact | Institution Apply/Study/Costs/Evidence sections | Existing sourced canonical equivalents | Institution/programme/population keys, reporting period, verification, permission evidence and source version. |

The installed `learning_resources` schema accepts only `practice`/`destination` and requires `reuse_mode=link_metadata_only` plus `content_imported=false`. It is not a safe place to store original article bodies or licensed banks under a misleading link record. Article publishing/versioning is a further integration, and should preserve the current route/slug system instead of replacing it.

For hosted article management, first design the minimum draft → review → publication → superseded workflow with immutable version IDs, original author, editor/reviewer, scope/cycle and per-reference checks. Reuse the existing staff Catalogue/Review/Operations navigation and published-parent/verified-evidence conventions. No new schema or live CMS is asserted in this pass.

Before scaling resource versions, fix complete retrieval: `/api/learning-resources` currently orders by retrieval date and applies `.limit(100)` **before** `latestResources` deduplicates by slug; the client contract also accepts at most 100 rows. Many versions of a popular slug can crowd out older unique resources. Pagination or a deliberately bounded latest-per-slug public projection must return complete results, detect truncation, and preserve the existing timeout/byte/cancellation checks and installed reviewed fallback. The current 19-link set fits the limit; this is a growth constraint, not a claimed current outage.

All 19 link records currently retain the 9 October checked timestamp. Version each actual recheck; do not change it merely because an article was edited. Store link-only metadata separately from rights to reuse content/media. A provider page URL in `rights_url` alone does not license copying its bank or images.

## Fresh primary-reference checks on 13 October

- UCAS reconfirms **15 October 2026 at 18:00 UK time** for 2027 entry at Oxford/Cambridge and most medicine/dentistry/veterinary courses, and **13 January 2027 at 18:00 UK time** for courses outside that group. The immediate deadline makes cycle/scope maintenance useful now. These are source checks for guidance, not newly published institution deadline facts. [Special-course event](https://www.ucas.com/events/2027-entry-deadline-for-the-universities-of-oxford-and-cambridge-and-most-courses-in-medicine-475536), [general-course event](https://www.ucas.com/events/2027-entry-deadline-for-all-undergraduate-courses-except-those-with-a-15-october-deadline-475546).
- ETS confirms the 1–6 half-band TOEFL scale for tests from **21 January 2026** and a two-year transition with a comparable overall old-scale score. Institutions set their own conditions. Retain test date, reported scale and programme acceptance evidence; do not invent a CollegeStat conversion or requirement. [ETS institutional score-scale guidance](https://www.ets.org/toefl/institutions/ibt/score-scale-update.html), [ETS score-report FAQ](https://www.ets.org/toefl/test-takers/ibt/faq/score-reports.html).
- College Board's Student Question Bank remains accessed through My Practice with a school sign-in ticket or personal College Board account. The existing access description is useful; the number of questions on the provider site is not a CollegeStat import count. [Official Student Question Bank guide](https://satsuite.collegeboard.org/practice/student-question-bank).
- ETS's preparation page remains an official gateway with provider-hosted practice and preparation options. Continue linking rather than importing that material. [Official TOEFL preparation](https://www.ets.org/toefl/test-takers/ibt/prepare.html).

The attempted older UCAS dates-page URL was inaccessible through the web tool; official event/search results and the current canonical dates page corroborated the deadlines. The DET preparation URL exposed only its script-driven shell in this audit, so it is a **candidate for further verification**, not a newly verified resource. No further latest-ranking release claims are added beyond the dated 11 October source-refresh receipt.

## Exact safe reproduction and publication gates

From the repository root, the aid adapter below is the audited **read-only** command. Its printed 13 October result was 59,829 candidates, 27 fields, 2,469 institutions, zero writes/publications; value signature `265b4a0dbe5512b7fb24637070cad725`, field-contract SHA-256 `5af5c64cf9631c268c0c02863b52771e7e7a5c9b3c22a647bd4901d423aa61f5`.

```sh
python3 scripts/ingestion/ipeds-aid-extension-oct11.py --reviewed-at 2026-10-13
```

For a **separate future local preparation**, this supported option writes review artifacts only and refuses changed existing artifacts. Use a fresh destination; it does not stage or publish remotely:

```sh
python3 scripts/ingestion/ipeds-aid-extension-oct11.py --reviewed-at 2026-10-13 --stage-review --out outputs/ipeds-aid-extension-oct13-review
```

Before any hosted SFA extension, review `outputs/ipeds-aid-extension-oct11/00-read-only-preflight.sql`, `01-private-review-import.sql`, all 25 `02-pending-*.sql` files and their SHA-256 manifest. The 11 October hosted preflight saw 2,469 exact identity matches, 44,600 existing public SFA facts, and zero staged/public new metrics; it must be refreshed rather than treated as current. Publication still requires a new separately reviewed transaction after pending records exist and their values/populations pass review.

The exact existing review/preparation tools for other scopes are:

| Tool | What it actually does | Important constraint |
| --- | --- | --- |
| `scripts/ingestion/review-current-degrees-oct10.py` | Bounded Waterloo/WIUT source candidates; supports `--out` and `--no-fetch` | Seven fixed official pages; no hosted writes. New institutions/scope need new reviewed source definitions. |
| `scripts/database/prepare-current-programmes-staging-oct10.py` | Private staging artifact from the pilot's exact candidates/preflight/evidence | Existing package already staged; do not replay as new growth. |
| `scripts/database/prepare-reviewed-programmes-publication-oct10.py` | Prepares SQL for five exact offers and holds generic Economics | Uses hard-coded pilot input/output paths and a new review timestamp; no `--out` interface. Published already. Blind reruns can replace the prepared receipt and are not a new import. |
| `scripts/ingestion/review-official-requirements-oct10.py` | Scoped official requirement/fee/date candidates; supports `--out`/`--no-fetch` | Its candidate collector and script dates are the October 10 pilot, not a general current-source refresh framework. |
| `scripts/database/prepare-official-requirements-staging-oct10.py` | Five private dated rows / seven held undated facts; optional bounded `--fetch` | Requires exact existing input, evidence and hosted-preflight package; outputs pending SQL only. |
| `scripts/ingestion/review-graduation-cohort-oct10.py` | Read-only source review; supports `--no-fetch`, `--out`, `--report`, `--validate` | Original proposals keep null cohort years. Resolving source selectors must precede normalization/publication. |
| `scripts/ingestion/build-study-resources-oct09.py` | Rewrites the installed 19-record snapshot with the original fixed check date | Not a safe general incremental/dated resource editor. Extend/version this path deliberately before adding new entries. |
| `scripts/database/prepare-learning-resources-oct09.py` | SQL artifact with exact-URL source reuse and `(slug,retrieved_at)` insert-only versions | Asserts exactly 19 input resources. The existing 19 are already published; adapt/validate for a reviewed extension rather than replaying the package. |
| `scripts/database/deeper-data.py`, `npm run data:prepare` | Generates the earlier broad requirements/research/aid package | Includes already installed material and earlier hold/update actions. It is not an extension-only publication tool. Do not blindly apply it. |

Release sequence for each extension:

1. Name the exact source release and reuse permission. Verify raw/dictionary hashes; retain original receipts. Separate fetched/reviewed/published dates.
2. Reconcile the existing canonical university and optional programme/campus IDs by exact crosswalk. Hold ambiguous and combined reporting units. Name similarity produces review suggestions only.
3. Validate field definitions, missing/suppressed/imputed flags, unit, currency, population, reporting period and precision. Keep unknowns null; do not synthesize ranks, score conversions, eligibility or rates.
4. Run complete read-only target preflight. Deduplicate immutable source keys and reject differing existing values, evidence or identities. Do not count candidates already public.
5. Generate a small manifest-backed private-review artifact using existing schema equivalents. Review independently; preserve previous facts and all audit history. Structured facts must use their section-specific path.
6. Verify the guarded publication transaction locally, including rollback on identity/value conflicts and denied anonymous visibility of pending records. Check completeness/value signatures before declaring success.
7. After the actual protected release, verify exact anonymous public rows, complete count, hashes/scope and source links; write a dated publication receipt, then update the public summary and local reviewed overlay. A request timeout needs read-back before any retry.

Relevant existing checks for implementation work: Python aid-extension/current-degree/official-requirement/GR tests; Node reviewed-programme, structured-review guard, learning-resource schema/service, article-integrity, resource-state, comparison-scope and workspace-navigation tests. This documentation audit did not rerun the app test/build suites or claim new runtime/browser verification.

## Acceptance criteria for the next data/resource release

- Report additional **published** facts and unique affected institutions separately, with before/after read-back receipts. Candidate and metadata counts remain distinct.
- Preserve the 14,003 canonical identity IDs, original publisher facts, all existing history and owner-private workspace boundaries.
- Current programme, admissions, cost and requirement pages show scope/cycle/source and honest unknowns; historical completions and prior policies remain visibly historical.
- New resource slugs/versions are complete and searchable, do not displace earlier distinct resources through the 100-row limit, and preserve official access/licensing labels.
- Articles remain original, cited and actionable; externally protected tests/essays/media are linked or separately licensed before reuse. No unverified Muse claim reaches publication.
- No new datasets, hosted writes, account actions or deployment are claimed for this audit. Its deliverable is this evidence-backed plan.
