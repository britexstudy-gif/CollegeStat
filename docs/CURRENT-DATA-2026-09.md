# Catalogue update — September 28, 2026

> This is a historical checkpoint. The 1 October catalogue now contains **8,985 identities across 175 countries** after cached ROR reconciliation added 648 profiles and restored 1,146 ranking joins. Across installed editions, 4,813 ranking records link to profiles and 384 remain unmatched. The added matching does not change publisher positions or refresh the underlying snapshots. See `docs/PRODUCT-QUALITY-2026-10.md` for current UI, platform assets, Programs and verification. Current Supabase public configuration is present; hosted schema/data and private account flows remain unverified. Support replaces Statistics in navigation.

The local catalogue contains **8,337 distinct profiles across 173 countries**. Identity is corroborated through active ROR Education records, active four-year degree-granting IPEDS institutions and reviewed reference profiles. Registry inclusion is not accreditation. MIT's duplicate directory identity was reconciled to `/university/mit`; its previous URL and API identity resolve to the canonical record.

## Installed releases

- **QS 2027: all 1,504 ranked institutions**, downloaded from the official [QS spreadsheet page](https://www.qs.com/insights/qs-world-university-rankings-2027-results-table-excel). The file is `2027 QS World University Rankings 1.1 (For qs.com).xlsx`; SHA-256 `cf18557a206a75248c921f3b58f4b48ce76463fa5b818de93358913ceda94a7a`. 1,075 entries currently match catalogue profiles by unique normalized name or registered alias and country. Unmatched institutions remain visible in the full paginated table, linked to the source. Ties, bands and published indicator scores are preserved.
- **THE 2026: all 2,191 ranked institutions** from the [publisher response](https://www.timeshighereducation.com/json/ranking_tables/world_university_rankings/2026). Reporter-only institutions are excluded from the ranked table. 1,493 profile matches have rank/score information and publisher student snapshots. Snapshot census years are unspecified and are never labeled as 2026 observations.
- ROR 2.13, September 22, 2026, CC0: [release](https://doi.org/10.5281/zenodo.22902037). ZIP checksum verified. 7,523 directory records linked after repeat identity reconciliation.
- IPEDS HD2025, IC2025 and EFFY2025: 2,820 active four-year degree-granting institutions linked. Enrollment covers July 2024–June 2025, rather than a 2026 census. Identity snapshot was downloaded September 26.
- IPEDS ADM2024: latest installed admissions release, Fall 2024. Rates use reported admitted/applicant counts. SAT sections are retained separately; no invented composite or admission prediction.
- **IPEDS COST1_2024** and dictionary: downloaded September 28 from `https://nces.ed.gov/ipeds/complete-data-files/COST1_2024.zip`. Published cost observations for **2,533 profiles**. Dictionary confirms academic year **2024–25**. Residency-specific undergraduate tuition, required fees, housing, food and application fees are labeled explicitly. Only reported/zero values with R/Z flags are accepted; out-of-state rates are never presented as international prices. Original ZIP/dictionary and hashes are retained in `data/raw/ipeds`.
- Existing QS 2026 excerpt is retained as an older edition. ARWU 2025 and Leiden 2025 coverage is still selected, not complete or current to 2026.
- IPEDS SFA2324 is downloaded but its financial-aid amounts are not yet normalized for publication.

## Product behavior

`/rankings` serves 24 entries per page, with country/name filters, exact totals and boundary-clamped pagination. A missing profile match never removes a publisher row. Profiles show the newest matched edition for each publisher, including QS indicator graphs.

`/statistics` shows country/territory ranking representation and directory coverage. US state charts show the median institutional Fall 2024 admission rate and summed 2024–25 twelve-month headcounts, alongside coverage counts. These are not national population estimates or individual admission probabilities. Country grouping follows publisher labels; Northern Cyprus is retained as a publisher territory label.

Comparison includes current installed admissions/enrollment, separate in-state/out-of-state costs, charts, publisher ranks and official links. All exported figures retain their reporting year and source. Sources with unlike student populations or years remain explicitly labeled.

Profiles expose official admissions, application, aid, net-price, address and telephone fields where present. **29 institutions have social accounts read from their official homepages**, favoring footer links and excluding individual posts. Cached source HTML and retrieval dates are retained. Other contacts/media may come from the cited Wikidata/Commons references; coverage remains incomplete. No account handles or email addresses are guessed.

Search uses exact-name/alias and prefix relevance, featured starting points and up to three recent searches stored on the device. The dark glass capsule follows the supplied screenshot. Optional browser speech recognition starts only when its microphone control is pressed. Carousel autoplay advances every 2.2 seconds and pauses for interaction, hidden tabs or reduced-motion preferences.

Resources have watercolor illustrations, practical checklists and official references. `/support` offers free/supporter plan preferences stored locally; payments are **not connected** and no subscription is created. Sign-in includes back navigation and preserves the previous browsing route and filters.

## Deferred services and remaining coverage

The user explicitly deferred Supabase connection. Google, Apple, Telegram and email account flows are prepared but live registration and private workspace persistence are not active. No fake login is used. Payment processing is also unconfigured. Full ARWU/current Leiden, worldwide comparable admissions/costs, complete profile imagery/socials, and institution-specific current scholarship/application requirements remain unfinished coverage work.

No computer-use or browser automation was used. Validation is via TypeScript, lint, unit/data tests, production build and localhost HTTP checks; pixel-level rendering and click interactions were not visually verified.

## Rebuild

1. `npm run ingest:current:fetch` downloads IPEDS releases and dictionaries with file metadata.
2. `npm run ingest:global` rebuilds identity candidates and performs ROR/IPEDS curation; COST1_2024 is required.
3. Run `scripts/ingestion/link-rankings.py` with Python packages `pypdf` and `openpyxl`, and the retained official QS/THE files.
4. `python3 scripts/ingestion/official-socials.py` refreshes/reuses cached official homepage sources for the bounded leading-university selection.
5. `npm run ingest:profiles` resumes organizational Wikidata/Commons enrichment while respecting service limits.
6. `npm run ingest:global:sync` remains a dry run by default. Hosted synchronization and account activation are deferred.

The Vite dataset guard prevents the CommonJS plugin's comment-stripping regex from scanning large JSON strings; Vite's JSON transform still handles those modules normally. This fixes the startup/build stall without patching dependencies.

## 28 September 2026 — applied profile library and artwork update

The local app now connects these downloaded snapshots to the profile, ranking,
search, comparison and regional statistics views:

- ARWU 2026: the full 1,000-row publisher table, 713 exact identity matches,
  publisher national/regional rank labels, scores and paginated results.
- QS 2027 (1,504 rows) and THE 2026 (2,191 rows) remain complete tables. Country
  positions calculated within those global tables are labeled accordingly;
  they are **not** separate QS/THE regional ranking editions. Bands retain
  within-country uncertainty instead of inventing exact positions.
- THE 2026 institutional snapshots now include broad subject areas as well as
  student totals, international share and student/staff ratios. Broad subjects
  are distinct from named degrees and current admissions availability.
- IPEDS C2025_A: 148,432 program/award combinations across 2,731 institutions,
  with named CIP subjects, qualification filters, pagination and completion
  graphs. Coverage is first-major, positively reported completions for July
  2024–June 2025; these are not promises of current course availability.
- TUM: 183 named courses parsed from all 19 pages of its official course finder,
  checked 28 September 2026, with course-specific requirements links. Oxford's
  course listing was readable via search but direct download returned 403;
  retain its official link without claiming a complete imported catalogue.
- OpenAlex: 7,521 exact ROR-linked institution identities; 4,228 recent article,
  review and preprint records on 847 profiles. Papers are dated 2025 through
  28 September 2026. Requests stopped on HTTP 429. Empty local paper lists mean
  missing download coverage, not zero university output. Full text was not copied.
- Expanded licensed Wikimedia evidence: 616 enriched profiles, 495 campus
  photographs and 274 logo records. The Wikidata pass attempted 1,000 profiles;
  320 identities were unavailable during server maxlag responses. Image source,
  creator and license remain attached. OpenAlex provides 3,652 institutional
  thumbnail URLs (some are campus photos, not logos); these are distinguished
  from verified logo records. 288 thumbnails were cached locally before HTTP
  429 stopped that importer. Remaining thumbnails load from the source and
  fall back to institution initials on failure.
- Seven dated official guidance records cover UCAS 2027 entry, Chevening 2027–28,
  DAAD, MIT requirements, and TUM/Oxford course finders. These are selected
  official updates, not a comprehensive live news feed. Future dates describe
  announced cycles, not events asserted to have happened in 2027.
- Six generated cobalt/halftone collage illustrations replace the
  watercolor imagery on the landing, resources and support pages. Local files:
  `public/images/resources/*.webp`. Prompt and source-file manifest:
  `docs/editorial-image-prompts.json`. Illustrations do not impersonate actual
  university campus photographs or institutional logos.

Search now uses light glass styling and deterministic phrase interpretation,
including named subjects, destinations, qualifications, budgets and acceptance
rate bounds. It retains remaining university-name terms. Historical program
records can support subject/degree discovery, but never imply a teaching language.
Comparison has category tabs and program/research rows with original source years.

Run `npm run data:export` to regenerate the portable NDJSON import bundle at
`data/exports/library-2026-09-28/`. Its manifest lists row counts and SHA-256 hashes;
its README describes stable IDs, image upload paths and JSONB/relational options.
No hosted database or authentication provider was connected, as requested.

Validation: 32 automated tests, TypeScript, ESLint and production build passed.
Read-only localhost HTTP checks passed for 18 routes, all six new artwork assets,
smart search, official course rendering, program/research API data, anonymous
access controls, and final-page boundaries for all three full ranking tables.
No computer-use/browser automation was used.
