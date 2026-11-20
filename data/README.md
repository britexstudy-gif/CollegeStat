# data/ — map and rules

Inventory as of 16 Nov 2026. "Readers" lists the code that opens each file (from a grep over
`app/ server/ lib/ components/ scripts/ tests/ worker/`). `*.d.json.ts` files next to a JSON file are
its type declarations and travel with it.

## Rules

1. **Lifecycle.** `raw/` (downloads, untouched) → `processed/` (script output, regenerable) →
   `review/` (staged research, not shown to students) → `published/` (reviewed, safe to show) →
   `generated/` (built by `npm run catalogue`, never hand-edited) → `v2/` (rows for the v2 database).
2. **App code reads only `published/`, `generated/` and (later) the v2 database.** Today four
   `review/` files are read at runtime (marked ⚠ below); promote them to `published/` or to v2.
3. **Every fact carries a source**: `source_url` + `retrieved_at` (or `checked_at`). v2 rejects
   rows without one (`data/v2/rejects.ndjson`).
4. **Dated names** (`-oct15`, `-nov14`) mark a research batch. When a newer batch supersedes one
   and nothing imports the old file, move it to `archive/` (same sub-path). Never delete research.
5. **Large inputs stay out of the bundle.** Files over ~1 MB that the Worker needs go through
   `lib/asset-datasets.ts` (copied to `dist/client/data/` by `scripts/build-asset-data.ts`).
6. **Don't copy rivals' text or assets**; licences live with the record (`licence`, `license_url`).

## Map

| Folder | Size | What it is | Status |
|---|---:|---|---|
| `raw/` | ~370 MB, 8.8k files | Original downloads: ROR, IPEDS, Scorecard, Carnegie, Leiden, ARWU, OpenAlex, Wikidata, HIPO, NCSES, official pages | Inputs to `scripts/ingestion/*.py`; keep |
| `processed/` | 21 MB | Script outputs (`local-catalogue.ts`, `openalex-current.py`, `normalize-public.py`) | Regenerable |
| `published/` | 118 MB, 95 files | Reviewed datasets the app and build read | Current |
| `review/` | 54 MB | Staged research batches, URL checks, logo staging | Mixed, see below |
| `segment/` | 64 KB | `targets.json`: the 204 Central Asia target universities | Current |
| `generated/` | 169 MB | `catalogue/` (list + 64 shards + ids + featured), ranking tables | Built by `npm run catalogue` |
| `exports/` | 126 MB | `01–03-*.sql` (Supabase bundle, `scripts/database/bundle.ts`), `library-2026-09-28/` NDJSON snapshot | Frozen snapshot |
| `v2/` | 45 MB | v2 rows (CSV for COPY + NDJSON), `coverage.md`, `rejects.ndjson` | Built by `npm run data:v2` |
| `curated/` | ~30 MB | One canonical record per university with per-field provenance, history, exclusions, conflicts, coverage, collection queue | Built by `npm run data:merge` |
| `archive/` | 372 KB | Superseded files nobody imports | Frozen |

## v2 (normalised model)

- Schema proposal: `supabase/proposals/20261115_data_v2.sql` (not applied).
- Build: `npm run data:v2` (= `node --import tsx scripts/ingest/build-v2.ts`). Deterministic: ids are
  UUID v5 of each row's natural key; same inputs give byte-identical files. Re-run after any input changes.
  Reads `review/targets-latest-nov15.json` and `review/programmes-latest-nov15.json` when present.
- Check: `npm run data:v2:check` applies the proposal to an in-memory Postgres (PGlite), COPYs every
  CSV in FK order (all CHECKs + FKs run) and probes `explore_universities_v2`.
- Load into Supabase (owner, after applying the migration), in this order:
  `sources, universities, programmes, university_media, rankings, admissions, deadlines, costs,
  application_requirements, programme_requirements, scholarships, scholarship_universities, essay_prompts`:
  `\copy v2.<table> (<header columns>) from 'data/v2/<table>.csv' with (format csv, header true)`.
- Read layer: `server/data-v2/` (types, queries, column lists). Not used by the app yet.

## curated/ (data-ops: merge → check → queue)

Code: `scripts/data-ops/` (model, adapters, datasets, normalise, resolve, confidence, gates, merge, check, queue, feed, review, patch). Tests: `tests/data-ops.test.ts`, `tests/data-ops-trust.test.ts`.

```
npm run data:merge                  # all adapters → data/curated/*  (add -- --ai-review for review-batch.json)
npm run data:check                  # quality gates → check-report.json + coverage.md (exit 1 on errors)
npm run data:queue                  # next-queue.json (add -- --shards 4 --size 40 for queue-shards/input-N.json)
npm run data:v2 && npm run data:v2:check   # v2 CSVs now built from the curated set
```

Re-runnable and deterministic (same inputs → byte-identical files). New collector outputs are picked up by globs:
`review/oc-shards/output-*.json`, `review/targets-latest-*.json`, `review/programmes-latest-*.json`, the newest `review/scorecard-*.json` and `review/us-history-*.json`,
`review/cds-*.json`, `review/datasets-nov16.json` and `review/datasets-nov16b.json`.

- **Model** (`model.ts`, zod): `{id, slug, name, country_code, website, is_target, target_rank, facts, alternatives, aliases, merged_ids, collectors}`;
  every fact = `{value, source_url, retrieved_at, method (fetched|snippet|dataset), collector, confidence, basis, derived?, verified, academic_year, flags, note}`.
  Fields added Nov 16: `applicants`, `admitted`, `gpa_avg`, `c7_factors` (factor → very_important|important|considered|not_considered), `room_board`,
  `intl_aid` `{available, count, avg_usd}`, `intl_students`; `sat_scores` gained optional `composite_25/50/75`. CDS test policy maps to `sat_act`.
- **Adapters** (one per input shape): oc-shards (PROMPT.md shape), targets-latest, nov14-merged, programmes-latest, programmes-costs-nov14,
  published dates/fees/requirements, College Scorecard 2025/26, pre-refresh US history (IPEDS 2023/24), IPEDS 2023, Wikidata, and (`datasets.ts`):
  **Common Data Set** (`cds-*.json`: C1 applicants/admitted/rate, C9 SAT/ACT, C7, C12 GPA, C21 deadlines, G1 tuition (tuition only; fees → `mandatory_fees`), room & board, H6 intl aid; a 2024-25 CDS lands in history),
  **CRICOS + DUO** (`datasets-nov16.json`: bachelor programme lists with duration; CRICOS tuition/year = total course cost ÷ duration, shown as min–median–max AUD, `derived: true`),
  **round-2 datasets** (`datasets-nov16b.json`: KCUE tuition, UCAS applicants/accepted per provider → fields; visas and applicants/accepted by domicile for KZ/UZ/KG/TJ → `curated/country-stats.json`).
- **Normalising**: currencies → USD with the dated table `curated/fx-rates.json` (ECB 2026-11-13 + CBU; missing currency → `fx-missing`),
  semesters annualised, dates → ISO (`date_inferred` when the year came from the cycle), IELTS 4–9, TOEFL iBT 0–120 **and** the 1–6 band for tests from 21 Jan 2026, Duolingo, platform enum.
- **Latest data only** (owner rule): 2026/27 preferred, else 2025/26. Older academic years never enter the current view; they go to `history.ndjson` with their year (trends).
  Every current fact carries an academic year (`year-from-retrieval` flag when the source gave none).
- **Conflict rules**, in order: official fetched > search snippet; newer academic year > older; verified dataset > research; otherwise a tie →
  both kept (`alternatives`, flag `conflict-tie`). Compatible values (one more specific) are agreement and raise confidence (`corroborated:n`).
  Losers go to history. Deadlines resolve per round; documents/programmes/bachelor_fields are unions.
- **Confidence + basis** (`confidence.ts`): confidence = strongest agreeing source's tier × freshness + agreement − disagreement.
  Tier: official dataset 1.0, official fetched page 0.85, community dataset (Wikidata) 0.7, search snippet 0.4. Freshness: 2026/27 1.0, 2025/26 0.9 (no year → year of retrieval).
  +0.1 per independent agreeing source family (snippets ~+0.05, max +0.2); a kept tie −0.2; a lower-ranked official source that lost −0.05; failed cross-checks −0.1/−0.15; derived values ≤ 0.7.
  `basis` is the short human reason ("College Scorecard 2025/26 + Common Data Set 2025-26 agree", "search snippet — check official site").
  UI: `trustOf(confidence)` → verified ≥ 0.85, likely ≥ 0.6, else "check official site". When an official source agrees with a snippet, the official value is the one shown.
- **Cross-source validation** (`gates.ts crossChecks`, output `validation.ndjson`): SAT Scorecard vs CDS > 30 pts, admit rate Scorecard vs CDS > 5 pts,
  CDS rate vs admitted/applicants, tuition change > 25 % vs the newest older-year value → warning + confidence penalty + `xcheck:*` flag;
  admitted > applicants → both values dropped (logged in `rejects.ndjson`). FX sanity: every money `usd` must equal amount × dated rate (×2 for annualised semesters) → reject.
- **Gates**: missing source → reject; tuition 0–120k USD, IELTS 4–9, acceptance rate >0 and ≤100, SAT/ACT ranges, deadlines inside the cycle → reject the value (university kept, `rejects.ndjson`);
  stale (> 12 months) flagged; jumps vs the previous run (`universities.prev.ndjson`) reported by `data:check`.
- **Exclusions** (hidden, never deleted — `excluded.ndjson` keeps the full record; undo with `curated/overrides.json` `{"keep": [ids], "exclude": [{"id", "reason"}]}`):
  closed US institutions (Scorecard CURROPER=0), no bachelor's (HIGHDEG certificate/associate), true duplicates (same unitid / ROR / name+country+domain, not when unitid or city differ → campus)
  merged into one record with aliases, and records with no website, no ranking and no facts. Targets are never auto-excluded.
- **Queue** (`next-queue.json`): value = (target ? 3 : 1) × Σ weight of missing fields (tuition 3, deadlines 3, platform 2, English 2, documents 1.5,
  programmes / intl_aid / US SAT / US admit rate 1) × (1 + 0.5 per core fact to verify) × popularity (rankings + target position). Each item has `fetch`:
  the exact fields to collect or verify with a hint — collectors fetch only those.
- **Outputs**: `universities.ndjson` (current), `history.ndjson`, `validation.ndjson`, `country-stats.json`, `excluded.ndjson`, `conflicts.ndjson`, `rejects.ndjson`, `run-report.{md,json}`, `coverage.md`, `check-report.json`,
  `next-queue.json`, `review-batch.json` (opt-in, for an LLM worker; no API calls), `scorecard-status.json` (slim CURROPER/PREDDEG/HIGHDEG cache of the raw CSV),
  `published-patch.json` (proposed changes to `published/global-directory.json` — **not applied**; owner approves).
- **Feed**: `scripts/ingest/build-v2.ts` reads `curated/` when present (`scripts/data-ops/feed.ts`): admissions, deadlines, costs, English/SAT requirements and programmes
  come from the curated set; excluded universities get `published = false` in `v2/universities`.

## published/

| File | Size | Holds | Readers |
|---|---:|---|---|
| global-directory.json | 15.6 MB | Master directory of 14k identities | 63 files (server/featured-catalogue, statistics, scripts) |
| openalex-current.json | 15.6 MB | OpenAlex research works per university | server/profile-library, ingestion |
| imported.json | 13.8 MB | Imported observations (IPEDS, Leiden…) | server/catalogue, ingestion |
| wikidata-facts-nov14.json (+ `-shards/`) | 10 MB | Wikidata facts; shards are served as assets | scripts/data/wikidata-facts-nov14.mjs; shards via lib/asset-datasets |
| reviewed-ipeds-graduation-outcomes.json | 9.4 MB | IPEDS graduation outcomes | ingestion + python tests |
| official-web-profiles.json | 5.6 MB | Official-site profile extracts | server/featured-catalogue, global-catalogue |
| ipeds-us-stats-2023.json | 4.3 MB | US stats, keyed per id → asset buckets | server/university, lib/asset-datasets |
| auto-logos-provenance.json | 3.3 MB | Site-icon provenance (source, sha256, surface) | media scripts, components/college/primitives |
| registry-identity-expansion-oct06.json | 3.3 MB | ROR identity expansion | ingestion |
| reviewed-national-rankings.json | 3.2 MB | National rankings | app/api/rankings/national, server/rankings-view |
| ranking-all.json | 3.1 MB | QS/THE/ARWU rows | 19 files incl. server/ranking-table |
| ranking-records.json | 2.8 MB | Ranking records per university | server/featured-catalogue, global-catalogue |
| program-catalogue.json | 2.8 MB | Reported programme lists | server/profile-library |
| reviewed-ipeds-aid.json | 1.9 MB | IPEDS financial aid | ingestion/database scripts |
| reviewed-openalex-metrics.json | 1.8 MB | OpenAlex metrics | server/profile-library |
| publisher-students.json | 1.5 MB | Publisher student counts/subjects | server/featured-catalogue, global-catalogue |
| college-scorecard.json | 1.5 MB | Scorecard, keyed → asset buckets | server/university, lib/asset-datasets |
| ranking-profile-index.json | 1.5 MB | Ranking profile index (asset) | server/rankings-view |
| reviewed-leiden-expansion.json | 1.3 MB | Leiden metrics | server/leiden-metrics |
| certificates.json, sat-question-bank.json | 1.0 / 0.8 MB | Test-prep content | lib/certificates |
| cited-ranking-tables-oct20.json, cited-rankings-oct20.json | 0.9 / 0.4 MB | Cited ranking tables | lib/directory-rankings, directory-ranking-positions |
| reviewed-webometrics-oct15.json (+ profile index) | 0.7 / 0.2 MB | Webometrics | lib/directory-rankings |
| profile-enrichment.json | 0.7 MB | Profile enrichment | server/featured-catalogue, global-catalogue |
| ranking-identity-reconciliation.json, ranking-unmatched.json | 0.4 / 0.1 MB | Ranking ↔ identity matching | ingestion, tests |
| auto-logos.json | 356 KB | id → icon format map | server/auto-logos, lib/auto-logo |
| ipeds-admissions-2023.json, ipeds-fees-2023.json | 320 / 92 KB | IPEDS admissions / fees | admission simulator, server/tuition-index |
| reviewed-university-enrichment-oct15.json | 252 KB | Reviewed enrichment | lib/university-enrichment |
| common-app-members.json | 236 KB | Common App members | server/university, lib/application-platforms |
| national-publication-oct10.json | 204 KB | National publication review | scripts/database/review-national-publication-oct10.py |
| university-history-oct20.json, university-videos-oct18.json | 156 / 56 KB | History notes, YouTube videos | server/university |
| institution-image-cache.json | 116 KB | Institution image cache | server/featured-catalogue, global-catalogue |
| requirements-current.json, requirements-segment-nov14.json | 116 / 44 KB | Entry requirements | server/global-catalogue |
| scholarships-researched.json, scholarships-current.json | 112 / 16 KB | Scholarships | lib/scholarships-load, sitemap |
| national-ranking-search.json | 104 KB | National ranking search index | app/api/rankings/national |
| official-socials.json, official-programs.json | 92 / 64 KB | Socials, official programmes | server/global-catalogue |
| reviewed-requirements-oct05.json, reviewed-application-rounds-oct05.json | 92 / 28 KB | Oct reviews | database/ingestion scripts |
| program-dictionary.json, program-manifest.json | 76 / 4 KB | Programme vocabulary | server/profile-library, ingestion |
| application-briefs.json | 72 KB | Application briefs | server/global-catalogue, server/university |
| application-fees-*.json, application-dates-*.json | 8–56 KB | Fees and dates (current + nov14 segment) | server/global-catalogue, lib/application-platforms |
| external-articles-oct15.json, study-resources-oct09.json | 44 / 32 KB | Articles, study resources | lib/article-library, lib/learning-resources |
| scorecard-field-definitions.json | 44 KB | Scorecard dictionary | ingestion |
| reviewed-programmes-oct10.json, reviewed-campus-media-oct10.json, reviewed-scholarship-campus-media.json | ≤32 KB | Reviewed programme offers / media | lib/reviewed-* |
| directory-*.json, identity-redirects.json, regional-rankings.json, official-logos.json, official-admissions-sources.json, ranking-manifest.json, reviewed-*-aliases/identities*.json, common-data-set.json, admissions-current.json, current-guidance.json, campus-media-checks.json, notable-people.json, reviewed-profile-cache-oct11.json, reviewed-unirank-oct15.json, HIPO-LICENSE.txt | ≤8 KB each | Manifests, small lookups, licences | various (all referenced) |
| publisher-logo-credits.json | 4 KB | Licence credits for ranking-publisher logos in `public/` | **no reader** — keep as the licence record |
| publisher-profile-details.json | 4 KB | Short publisher profile notes (Sep 30) | **no reader** — review: wire up or archive |

## review/

| File | Holds | Readers | Status |
|---|---|---|---|
| targets-latest-nov15.json | Latest facts for the 204 targets (tuition, deadlines, platform, English, SAT/ACT) | scripts/ingest/build-v2.ts | Current (DATA worker) |
| segment-admissions-nov14-merged.json ⚠ | Merged nov14 admissions fields per target | server/profile-extras, server/tuition-index, lib/application-platforms | Current, read at runtime |
| programmes-costs-nov14.json ⚠ | Programmes + tuition for 30 targets | server/profile-extras, server/tuition-index | Current, read at runtime |
| scholarship-university-links-nov14.json ⚠ | Scholarship ↔ university links | server/profile-more | Current, read at runtime |
| scholarships-nov14.json ⚠ | 88 reviewed scholarships | lib/scholarships-load (Vite glob) | Current, read at runtime |
| segment-admissions-nov14.json, `-part1..4.json`, `-merged-fill-rate.json`, url-checks-admissions-nov14.json | Inputs of the merge | scripts/data/merge-admissions-nov14.ts | Superseded by `-merged`, but still merge inputs — keep |
| `*-summary.md` (nov14) | Batch notes | — | Notes; keep with their batch |
| scholarships-more-nov14.json | Extra scholarship candidates | **no reader** | Candidate for archive once the scholarship batch is closed |
| url-checks-articles/scholarships-nov14.json, articles-nov14/ | Link checks, article sources | scripts/data/* , lib/articles-* | Current |
| auto-logos-nov14-progress.json, logos-homepage-nov14-progress.json, logos-homepage-staging/ (783 files, 26 MB) | Logo collection state + staged files | scripts/media/collect-*-nov14.py | Working state of the LOGOS worker |
| university-enrichment-oct15/ (20 MB), university-enrichment-oct16/ | Enrichment receipts, coverage inventory | lib/university-enrichment, ingestion | Keep (receipts behind published data) |
| university-agent-batch-oct15.json, official-directory-links-018-050-oct15.json, webometrics-source-review-oct15.json, muse-public-universities-oct12.json, campus-media-candidates-oct10.json, reviewed-profile-cache-oct11.json, current-programmes-staging-oct10.json | Oct batches | their review scripts | Historic but referenced — keep |

## Moved to archive/ (16 Nov 2026) — nothing imported them

| From | To |
|---|---|
| review/official-admissions-staging-oct10.json | archive/review/ |
| review/official-directory-links-051-100-candidates-oct15.json | archive/review/ |
| review/ranking-provider-metadata-oct12.json | archive/review/ |
| review/top20-group-a…d.json, review/top20-staging-oct15.json | archive/review/ |
| scoring-framework-v1.json (draft) | archive/root/ |

Only `docs/archive/*.md` mention these (historical notes).

## Not moved (no reader, but kept deliberately)

- `processed/openalex-expanded.json` (15.6 MB, Sep 28): regenerable output of `scripts/ingestion/local-catalogue.ts`; `processed/` is already outside the Vite watcher. Safe to delete.
- `published/publisher-logo-credits.json`: licence record for `public/` logos.
- `published/publisher-profile-details.json`, `review/scholarships-more-nov14.json`: owner decision.
- `review/*nov14*` and `review/*nov15*`: workers active on 15–16 Nov.
