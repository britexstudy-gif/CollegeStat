# Dataset export plan (script not written yet)

Proposed script: `scripts/export/open-dataset.ts`, run as `npm run data:open-export`, writing to `dist/open-data/` (never into `data/`).

## Input

`data/curated/universities.ndjson` (curated, with provenance). Run `npm run data:check` first; abort on errors.

## Inclusion rules (a value is exported only if all hold)

1. `source_url` is present, http(s), and its host is not on the exclude list (rankings publishers with restrictive terms, social media, aggregators, agents).
2. `retrieved_at` present and `academic_year` is 2026/27 or 2025/26 (or the field is timeless).
3. Source class is redistributable: official university page (fact only), IPEDS / College Scorecard (public domain), Wikidata (CC0), Hipo list (MIT, name/country/website only), or a community contribution made under CC BY 4.0.
4. No `snippet`-only values from third-party sites unless the URL is an official page.
5. Not a copied text field: `text`, `note`, `label` strings are exported only after a length cap (160 chars) and a check that they are not verbatim page text; when in doubt, drop the text and keep the structured value.

Excluded entirely: rankings, images and logos (point to Commons via per-file licence if ever added), article/guide content, `programmes[].requires` prose, `is_target`/`target_rank`, `alternatives` (internal), `flags`/`confidence` internals (optional keep `confidence`), any user data.

A report `export-report.json` lists counts included/dropped per field and per reason, and the list of source hosts, so the owner can review exclusions.

## Curated fields exported

Identity: `id`, `slug`, `name`, `country_code`, `website`, `aliases`.
Facts: tuition, mandatory_fees, living_cost, application_fee, deadlines, platform, ielts, toefl, duolingo, sat_act, acceptance_rate, documents, founded_year, student_count, plus US federal fields (sat_scores, act_scores, cost_of_attendance, net_price, undergrads, international_share, grad_rate, median_earnings_10y, bachelor_fields). Programmes: name, degree, years only, with `source_url`.

## Formats

1. **JSON** (`universities.json`, and NDJSON): nested, full fidelity, one record per university with provenance per fact. Primary format.
2. **CSV** (flat, "long" and "wide"):
   - `facts_long.csv`: one row per fact: `university_id, slug, name, country_code, field, value_json, amount, currency, period, usd, source_url, retrieved_at, academic_year, method, verified, collector`.
   - `universities.csv`: identity columns plus a few wide columns for common fields (tuition_usd, ielts_overall, deadline_regular, platform_code), each with `_source_url` and `_retrieved_at` next to it. Dates ISO, UTF-8 with BOM-less header, `.` decimal.
   - Separate `deadlines.csv` and `programmes.csv` (child tables keyed by `university_id`).
3. **Parquet**: same tables as CSV (`universities`, `facts_long`, `deadlines`, `programmes`), typed columns, zstd compression. Produce with DuckDB (`COPY ... TO ... (FORMAT PARQUET)`) from the CSVs, so no heavy dependency enters the app. Run as a separate dev tool, not a runtime dep.

## Release package

- `dist/open-data/` : the files above, `schema.json` (JSON Schema generated from the zod model), `DATA_SCHEMA.md`, `DATA-LICENSE.md` (CC BY 4.0), `NOTICE` (source licences), `export-report.json`, `CHECKSUMS.txt` (sha256).
- Version by date: `v2026.11.16`. Tag releases on the data repo, publish CSV/Parquet as release assets (also consider Hugging Face Datasets / Zenodo for a DOI).
- Weekly or on-merge CI refresh of the export in the public repo.

## Safety checks before first publish

1. Run on a scratch dir; review 20 random universities against their source URLs.
2. Grep the output for emails, phone numbers, keys, `supabase`, user ids.
3. Confirm no value in the output has an empty source or a pre-2025/26 year.
4. Owner reads `export-report.json`, then decides. Only then create the public repo.
