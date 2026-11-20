# CollegeStat UI and workspace checkpoint — 8 October 2026

These changes are in the existing local checkout. They have not been committed, pushed or deployed by this pass. The preview is `http://localhost:5173`; it is available only while the local development server runs. Supabase/PostgreSQL, stable university IDs, profile URLs and installed observations are preserved.

## What changed

- The hero has a single search-first layout, shorter practical copy and full-width PixelBlast. Repeated pathway cards were removed. PixelBlast remains the user's chosen component. Its postprocessing compositor now receives CSS dimensions rather than drawing-buffer pixels: the previous double scaling could shrink the actual canvas on wide screens. Rendering remains bounded to a 1,200-pixel buffer, at most 30 fps, and pauses offscreen. Resize writes are deferred and unchanged sizes are skipped.
- A word-by-word scroll statement adds restrained movement. Complete semantic text remains available; reduced motion shows solid text. Section entries and the carousel keep keyboard/pause controls. The footer gathers its single particle wordmark when visible without requiring hover.
- One scholarship section shows actual campus photographs, linked institution identity, funding, eligibility and sourced dates. Current landing links use the existing singular `/scholarship/:slug` route. Closed cycles are excluded from the default selection.
- The admissions section and user sign-in show actual 2× captures of CollegeStat's working practice and writing studios. Captures exclude account identity and private drafts. The original interactive exercise remains available below the image. Decorative fake product cards are removed.
- Sign-in/register are larger and responsive, with visible Google, Apple and Telegram controls. Buttons accurately show setup status from backend availability checks; unconfigured services cannot sign users in. Staff access retains its separate email/MFA route. Session startup and navigation wait for the actual authenticated account, preventing stale anonymous state from replacing a successful sign-in.
- Student views have focused Practice/Writing navigation, original answer explanations, session progress, draft warnings and searchable private preferences. Existing preference keys are preserved when saving. Cross-device practice results and writing autosave are not installed.
- Staff overview preserves successful catalogue counts if an optional metric query fails. Database changes, registered accounts and signups are distinct from active-user telemetry. Catalogue/MCP interfaces retain role checks and MFA for writes.
- The directory's selected blue type control has white text. Search filters survive initial rendering and provider failures. A hosted search timeout now shows an inline retry state instead of a development error overlay. Some broad hosted queries still time out; no remote SQL change is claimed.
- ShanghaiRanking's white logo uses its red backing in both themes; Leiden uses blue. The provider catalogue shows nine identities with honest installed/partial/external states. Hosted regional selectors discover actual permitted QS editions rather than limiting them to the smaller local list.

## Data, coverage and licences

**No new university or ranking dataset was imported and no hosted catalogue records were written in this UI pass.** Local identity coverage is 14,000 across 212 countries; the documented hosted checkpoint is 9,000. The additional 5,000 identities remain an insert-only review plan. Nine provider references mean four installed systems (QS, THE, ARWU and selected Leiden indicators), not nine ranking datasets. Six installed systems remains a gap.

Read-only regional verification found 85 already-published QS positions across five editions. These are partial selections, not newly added ranks. Existing rank values, ties, bands, years and URLs remain intact. Derived ranking manifests now agree at 4,820 linked / 377 unmatched observations.

Three reviewed campus display assets are locally cached: Toronto reuses an existing licensed catalogue photograph; UBC and ETH add two supplementary display photographs. They are exact institution matches and have source, creator, licence, retrieval, scope, dimensions and SHA-256 evidence in `data/published/reviewed-scholarship-campus-media.json`. They are not three new hosted media rows. [Photo attribution and derivative licences](../public/images/scholarships/ATTRIBUTION.md) cover Toronto (CC BY 3.0), UBC (CC BY 2.0) and ETH (CC BY-SA 3.0). Two actual product screenshots add no university facts or student records.

The [ranking source review](RANKING-SOURCES-2026-10-08.md) records Leiden's CC0 terms, SCImago's written-permission restriction, unestablished redistribution grants for other providers and the distinction between CSIC Webometrics and similarly named independent operators. External publisher links never manufacture positions.

This pass adds no SQL migration. Existing additive evidence migrations `202610050001_evidence_scope.sql` and `202610050002_identifier_evidence.sql` remain; the broader MFA proposal stays outside automatic migrations. Requirements, current programmes, costs, international admissions, logos and regional/subject tables still have substantial coverage gaps. The [data checkpoint](DATA-DEEPENING-OCT05.md) and [full request/status audit](REQUESTS-AND-STATUS-2026-10-08.md) distinguish local, hosted and pending records.

## Verification

- Typecheck and ESLint passed.
- 106 Node tests and 34 Python ingestion tests passed.
- Production build passed; existing optional large-chunk/framework-classification and Node deprecation warnings remain.
- Public HTTP smoke passed: routes, profiles, all installed world editions, exact percentage controls, readable search labels, scholarship routes, anonymous privacy and authorization denial.
- Real account browser checks passed: four auth routes, 330/390/768/1440 layouts, sign-in, practice feedback/progress, writing tab continuity, country preferences and staff views. No page script errors were observed. The optional hosted audit-count request was unavailable; catalogue counts remained visible, including a simulated optional-metric outage.
- Staff HTTP/MCP checks passed: login, discovery, four read tools, assistant fallback, MFA denial, origin denial and hidden entry routes. No publication or catalogue content writes were performed.
- Both themes, automatic footer canvas, one scholarship section, actual product images, ranking colours and responsive overflow checks passed. After the compositor fix, ten viewport changes passed with zero ResizeObserver/page errors, one renderer, full CSS canvas width and a drawing buffer at most 1,200 pixels; reduced motion was checked.

Headless checks do not replace the owner's visual/touch review or production deployment testing. Browser evidence and logs stay in ignored `outputs/`; they contain no committed credentials. Social-provider credentials, email delivery/recovery, account deletion lifecycle, persistent learning/drafts, student AI and active-user analytics remain separate integrations.

## Reproduce and continue

```sh
cd /Users/likeanew/Documents/CollegeStat/collegestat
npm run dev
npm run typecheck
npm run lint
npm test
npm run test:data
npm run build
TEST_BASE_URL=http://localhost:5173 node tests/http-smoke.mjs
TEST_BASE_URL=http://localhost:5173 node tests/staff-http-smoke.mjs
node scripts/ingestion/cache-scholarship-campus-media.mjs
python3 scripts/ingestion/apply-reviewed-ranking-aliases.py
node scripts/run-muse.mjs --list
```

The staff smoke requires the existing ignored review-account file. Do not copy its credentials into notes or prompts. Media caching verifies hashes and preserves attribution; alias reconciliation repairs derived local manifests, not source ranks. Neither command publishes hosted data.

Eight scoped prompts and the checked CLI launcher are in [OpenCode / Muse setup](OPENCODE-MUSE-1.3.md). The inspected OpenCode v2.0.24 installation did not list a configured Muse model. Select the exact connected provider/model and `xhigh` only when supported; no substitute model or external agent task was launched. Use the [complete prompt pack](MUSE-SPARK-1.3-XHIGH-PROMPTS.md) for database depth, staff analytics, practice, writing/profiles, AI, rankings, verification and UI.
