# Loading and preview performance — 9 October 2026

This pass preserves Vinext/Vite, Supabase/PostgreSQL and every installed ranking observation. The verified bundled and hosted catalogues now contain 14,003 published identities across 212 countries, after 5,003 insert-only additions. No dataset was removed to make the preview faster.

## Changes

- Hosted layout, catalogue, comparison/profile and research routes load the complete local catalogue only inside their local-data branch. `discoveryPreview` now lives in a small independent module; importing hosted queries no longer imports the local programme and research libraries through the explorer.
- Anonymous published explorer results, search results, institution identities and discovery previews have bounded caches with a 60-second lifetime. Concurrent identical loads share one request. Failed queries are not cached. These caches never contain staff queries, sessions, private drafts or account preferences.
- Public Supabase calls have bounded query timeouts. Anonymous client initialization remains scoped to a worker request; a global auth client can retain locks owned by a canceled request. Pending public loads expire after 45 seconds so an abandoned request cannot poison the cache; a late completion cannot replace a newer result. Full university details remain separate from discovery cards.
- Auth, staff and dashboard pages render before fetching optional public featured cards. Middleware overwrites the internal pathname hint; this does not authorize users or change session/RLS checks. The public homepage keeps its sourced SSR catalogue.
- Homepage bootstrap uses a dedicated narrow summary RPC for the same twelve featured IDs, actual published total and distinct countries. It does not request global admissions/tuition medians. Older deployments fall back to the existing explorer only while the new RPC is missing; other errors are not silently retried through another expensive query.
- Vite watches application sources and public assets. It excludes raw releases, ingestion exports, QA outputs and tool state; these directories currently contain over 500 MB of unrelated working data. Codex polling uses a 400 ms interval.
- Named research questions use a bounded identity search before loading matching profiles; constrained questions retain the complete explorer filters. Session restoration, account/workspace reads and staff checks have bounded waits and retry/error states rather than indefinite loading.

## Measured evidence

Measurements are local development observations, not production guarantees. Active UI edits/HMR, the regional network and a cold Supabase query affect timing.

| Check | Measured result |
| --- | --- |
| Standalone complete fallback import before isolation | 1,300 ms; approximately 734 MiB added RSS |
| Standalone hosted query module after isolation | 116 ms; approximately 37 MiB added RSS |
| Directory API, page 2 | First public query 2,988 ms; repeated query 17 ms |
| Directory API, Harvard search | First public query 1,680 ms; repeated query 18 ms |
| Search API, Stanford | First public query 2,440 ms; repeated query 7 ms |
| Cached home catalogue API | 6 ms |
| QS table API | 159 ms; repeated request 10 ms |
| Sign-in after deferring optional featured cards | 43 ms |
| Sign-up / staff sign-in | 21 ms / 18 ms |
| Dashboard server response | 135 ms |

The table records early 9 October development measurements before the identity publication. A later narrow-summary run at 9,000 hosted rows measured a first catalogue response of 6,175 ms and a repeat of 19 ms; sign-in was 285 ms, dashboard 39 ms and Stanford search 2,836 ms followed by 12 ms. These timings include network and profile hydration. Final post-publication browser verification confirmed 14,003 identities/212 countries; it does not turn the earlier timing sample into a benchmark at the larger count. A named MIT research question after HMR took 14.9 seconds and returned three sourced facts; a strict constrained empty search took 1.0 second without broadening filters.

The preview's `compile: 1791509181...s` label is a Vinext development timing defect: it subtracts timestamps originating from Node and the Cloudflare worker without a shared clock origin. It is not billions of seconds of compilation. Measurements use actual client elapsed time. Cold module loading and hosted SQL still have real costs; first sign-in before the bootstrap change took 8.4–8.7 seconds. The short-lived cache improves repeated reads; cold global metrics need further work.

## Applied database migrations

The installed `explore_universities` function materializes complete university rows, including large JSON profiles, before returning only IDs and summary metrics. A read-only `EXPLAIN ANALYZE` of the hosted function took approximately 4,707 ms with 6,032 temporary blocks read and 1,508 written.

[`scripts/database/optimize-explorer-projection.sql`](../scripts/database/optimize-explorer-projection.sql) was applied as `20261009013407_optimize_explorer_projection.sql`. It projects only IDs, names, country codes and numerical facts; applies identity/program predicates before metric work; and skips optional facts unless requested by a filter/sort. It keeps the original metric precedence, historical observations, verification/publication filters, result order, validation and `SECURITY INVOKER`. The legacy `sort=name` rank alias is retained because the current public filter parser normalizes it.

The proposal is not a dataset import. Its local PostgreSQL compatibility test compares 29 filter/sort cases, a later page, source precedence, invalid inputs and anonymous/private visibility against an exact copy of the installed function. The root agent applied the checked migration `20261009013407_optimize_explorer_projection.sql` on hosted PostgreSQL and compared three actual before/after responses: identical IDs, order, total counts and medians. The same unfiltered RPC measurement improved from 4,707 to 3,543 ms; shared buffer hits fell from 204,028 to 104,435 and temporary block I/O fell to zero. Uncached global medians still require real work; this is not a claim that every cold query is instant.

[`scripts/database/home-catalogue-summary.sql`](../scripts/database/home-catalogue-summary.sql) provides the separate read-only `home_catalogue_summary()` RPC. It preserves the exact QS2027 normalized/profile precedence and rank/name/ID ordering, returns only twelve IDs and exact published counts, and keeps `SECURITY INVOKER` with explicit anonymous/authenticated execution grants. Its parity fixture compares the public explorer on tied ranks, provider/year mismatches, verified versus pending entries, provider licensing restrictions, hidden identities and an empty catalogue. It also confirms that anonymous clients cannot mutate identities or read private notes. Hosted anonymous statements retain their existing three-second timeout; a scalar JSON projection experiment confirmed error `57014` when expensive toasted-profile work exceeded that bound. Repeated JSON-path extraction and whole-profile pagination were rejected as ineffective alternatives.

The summary was applied as `20261009020127_home_catalogue_summary.sql`. Actual hosted parity confirmed the same twelve IDs, exact total and country count. `EXPLAIN ANALYZE` measured 224.225 ms at 9,000 rows before the identity expansion. No timeout was raised and neither migration changes data, history or owner permissions. The two applied migration files are retained in `supabase/migrations/`.

## Reproduce

```sh
npm run typecheck
node --import tsx --test tests/public-read-cache.test.ts tests/page-bootstrap.test.ts tests/explorer-performance.test.ts tests/discovery-update.test.ts tests/regional-editions.test.ts tests/current-rankings.test.ts
npm run dev
```

The new regression checks cover request coalescing, successful-load lifetime, outage retry, bounded eviction, abandoned request recovery, bootstrap routes and the public explorer result contract. The final suite has 156 passing Node tests and 66 passing Python tests, plus typecheck, lint, production build and public HTTP/browser checks. Authenticated end-to-end verification is limited by invalid stored QA credentials; no account was reset or modified. Evidence logs remain in ignored `outputs/`; no credentials belong in these notes.
