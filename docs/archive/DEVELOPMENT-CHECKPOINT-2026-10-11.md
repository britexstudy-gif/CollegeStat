# CollegeStat — development checkpoint, 11 October 2026

> **12 October scoped feature update:** [Articles and staff structure](ARTICLES-AND-STAFF-STRUCTURE-2026-10-12.md) records the new separate Articles routes, focused Resources views and read-only Operations structure preview. Its 14 public browser, 10 staff-fixture browser and 11 SQL/handler checks passed; scoped lint/typecheck passed. The structure SQL remains pending root hosted review/apply at that report's creation. These are scoped additions, not a new data publication or a final aggregate test/build claim. The dated facts below remain historical; follow the newer report for these UI features.

This is the current checkpoint. It supersedes the [10 October checkpoint](DEVELOPMENT-CHECKPOINT-2026-10-10.md) and older request tables where counts or implementation states differ. Existing React/Vinext, Supabase/PostgreSQL, stable university IDs, URLs, historical source observations and working features remain intact. Application changes are local and uncommitted; the hosted publications, migrations and two profile-cache repairs identified below actually reached Supabase. This is not a repository push or application deployment.

**Final lint/build reconciliation is pending.** The current complete Node run passed **486 tests**, and typecheck passed. The earlier Python run passed **204 tests**; the in-progress aid extension still needs its final ingestion rerun. The first Oct11 production build passed, but later projection and accessible-label changes require another build. The actual post-repair public THE/programme browser pass now has **nine checks and zero errors**. Do not describe an older build as final verification of the latest tree.

## Actual data, coverage and publication state

| Dataset or extension | Verified result | Publication and scope |
| --- | --- | --- |
| University identities | **14,003 published institutions / 212 countries** | Existing hosted and bundled coverage is preserved. No duplicate 14k import, institution per ranking list, or claim of complete admissions coverage. |
| QS / THE / ARWU | Original source rows **1,504 / 2,191 / 1,000**; **4,820 linked / 377 unresolved** across the retained 5,197 observations including partial QS 2026 history | Installed editions remain QS 2027, THE 2026 and ARWU 2026. Original positions, bands, ties and source records are unchanged. |
| Leiden Open 2025 | **7,158 reviewed indicators / 2,386 matched universities** | Selected scientific-impact indicators, with counting method and source periods; not an invented overall rank. Combined existing OpenAlex/Leiden research observations are not a count of distinct universities. |
| NCSES HERD FY2024 | **796 public expenditure positions / 796 profiles** | Exact source reporting units and UNITID matches. Research expenditure is not an overall world-quality rank. |
| NIRF India 2025 | **59 public category positions / 33 profiles** | An explicitly reviewed partial selection. Categories, ties and source positions are preserved. |
| National publication total | **855 public entries / 829 profiles / 14 enabled editions** | **184 source units remain held**; four empty editions remain disabled. Combined reporting units must not be assigned to individual campuses. |
| IPEDS SFA2324 | Existing **44,600 public canonical facts / 2,469 universities / 19 metrics** | **2023–24 provisional** aid, not 2024–25 and not a final file. Recipient averages, loan/grant types and cohort populations remain separate. |
| Additional SFA fields | Read-only source calculation found **59,829 potential facts / 27 unused fields / 2,469 existing identities** | Follow-up staging, deduplication and tests are in progress. **No additional hosted/public aid count is asserted here.** Do not add this candidate number to published coverage. |
| Current official degrees | **195 verified public offers**, increased by **five** | WIUT Business Management and Finance; Waterloo Computer Science, Data Science and Software Engineering. One generic WIUT Economics offer remains held until its precise pathway is identified. Unknown source year/language and Waterloo duration/intake remain null. |
| Dated admissions pilot | **Five hosted private candidates**, across Waterloo and WIUT | Three 2027 application/document dates and two separate 2026/27 domestic/international tuition facts. **Zero new public deadlines or costs.** Seven undated requirements remain local and held. |
| Existing section coverage | Requirements **75**, admissions **967**, costs **4,553**, deadlines **20** in the established section baseline | These figures describe existing coverage, not newly added facts or complete current coverage across 14,003 institutions. |
| IPEDS GR2024 | **20,596 candidate facts / 2,273 universities**, held | Conflicting entry-cohort labels and missing fall/full-year reporter scope remain unresolved. **Zero derived graduation rates published.** |
| IPEDS C2025 completions | Existing **148,432 historical records / 2,731 universities** | July 2024–June 2025 completions are not proof of current programme availability. |
| Official learning resources | **19 hosted links: eight practice and eleven destination resources** | Khan Academy, College Board and Bluebook are linked official resources. **Zero protected question-bank items copied.** Original mini exercises are not official exam scores. |
| Identity/media | Existing reviewed **11 official logos / 540 Wikimedia assets**; **six additional licensed campus display images** | Waterloo, Berkeley, Penn, NUS, Tokyo and McGill images have creator, licence, source and capture-year attribution. Display assets do not establish new university facts. **3,171 unattributed candidates remain held**; logos are incomplete. |
| THE profile caches | **Two existing hosted university projections repaired** | University of Education, Lahore and University of Okara retain their separate exact THE 2026 sources and student snapshots. This is a cache/identity repair, not a new ranking dataset or overwritten source observation. |

Publication evidence: [national receipt](../data/published/national-publication-oct10.json), [five current degrees](../data/published/reviewed-programmes-oct10.json), [private admissions staging](../data/review/official-admissions-staging-oct10.json), [licensed campus media](../data/published/reviewed-campus-media-oct10.json), [hosted profile-cache repair result](../outputs/profile-cache-hosted-result-oct11.json) and [verified profile-cache publication](../data/published/reviewed-profile-cache-oct11.json).

Original ranking signature `3766cd60a4d0ac0dd5c060d8ba90b351` and original source signature `a2818b85c0764df2c43206c6eeb26492` remain unchanged. The THE cache correction preserves both institutions' 1001–1200 band rather than inventing a precise position. Lahore's 29,744 and Okara's 19,640 publisher-reported students carry distinct institutional evidence. **2026 is the ranking edition, not an asserted student census year**; the census year remains unspecified. Original retrieval date and snapshot hash are retained separately from the identity-review date.

## Freshness and source permission

The independent [11 October source refresh](../outputs/verified-source-refresh-oct11.md) corrects research assumptions before imports:

- **THE 2027 is released**, with 2,297 ranked institutions in 118 countries. Installed 2026 history is retained. The newer edition remains a publisher reference because THE's copying/automated-extraction terms require written permission; it was not imported. [Official current table](https://www.timeshighereducation.com/world-university-rankings/latest/world-ranking), [publisher terms](https://www.timeshighereducation.com/website-terms-of-use).
- **Leiden Open 2025 remains the latest released edition**; 2026 is scheduled for November 4. CC0 results can be extended only while retaining exact selection, counting method, publication window and citation endpoint. The processed 2,773-row subset and the full 2,831-institution edition are different universes; their difference does not prove new institutions. [Release status](https://open.leidenranking.com/), [resources](https://open.leidenranking.com/resources).
- **HERD FY2024 remains the latest released survey**; FY2025 is scheduled for November 24. NIRF 2025 is the latest results edition independently verified in this pass; 2026 collection does not establish published results. [NCSES schedule](https://ncses.nsf.gov/schedule-of-release-dates), [NIRF results](https://www.nirfindia.org/Rankings/2025/Ranking.html).
- **uniRank requires prior written reuse permission.** Webometrics' original CSIC project and unrelated similarly named publishers remain distinct. CWUR, U.S. News, URAP and SCImago references are not installed ranking tables without an edition-specific reusable source. Twelve provider definitions do not mean twelve imported ranking systems. The six installed families are QS, THE, ARWU, Leiden Open, HERD and NIRF, with different scopes. [uniRank terms](https://www.unirank.org/terms/), [CSIC project](https://ipp.csic.es/en/webpage/ranking-web-universidades).
- **SFA2324 is 2023–24 provisional.** The actual cached dictionary governs its populations; a generic newer component page must not overwrite its September–August program-reporter cohort. A proposed SFA2425 dictionary returned 404. Net price moved to the new Cost Survey and needs that exact source/dictionary. [IPEDS files](https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx?year=-1), [release schedule](https://nces.ed.gov/ipeds/survey-components/data-release-schedule).
- **College Scorecard was updated June 10, 2026**, but the release's span through 2025–26 does not make every field a 2025–26 observation. No new Scorecard coverage is claimed before current-file retrieval, cohort matching and deduplication. [Official downloads](https://collegescorecard.ed.gov/data/).

Every publishable extension must preserve source URL/provider, source publication and observation period, retrieval date, population, verification state, evidence hash and exact identifier reconciliation. Missing periods stay unknown; loans are not grants, averages are not guaranteed awards, national results are not global ranks, and an international-eligibility claim requires explicit evidence. Google image discovery does not grant redistribution rights.

## Landing, student workspace and staff console

The landing page keeps the approved floating glass navbar, centred text/search hero and **PixelBlast**, with continuous animation and pointer interaction. The background pauses when hidden/offscreen or when reduced-motion/save-data preferences apply. The footer's large ParticleText assembles when visible, not only on hover. The carousel is manual, with no autoplay. Voice search was removed from the public navigation/search flow.

New sections add useful content without replacing the landing page with a dashboard/question mockup:

1. An original transparent university-journey illustration **below the hero**, with three clear research/planning steps. The optimized 1800×600 WebP is about 196 KB; it is editorial artwork, not a real institution photograph or source fact.
2. **One restored folder section**, with three folders and twelve real links for university research, application planning and funding. Links are visible on first render, keyboard/touch operable, and closed folders remove hidden links from focus order.
3. A compact comparison starter using real SSR university identities, supplied logos and locations. Add/remove actions preserve the user's actual selection and the five-university limit.
4. Evidence cards explaining requirements, periods and official sources, plus five accessible FAQ disclosures.
5. One scholarship showcase with attributed campus photos and real filters; compact installed-ranking cards and national-comparison links, with external publisher references clearly separate.

The student dashboard has **four primary sections: Home, Universities, Library and My profile**. Universities includes discovery, rankings and comparison inside the workspace. Home exposes saved universities, explicit application-plan actions, writing and research guides; the new application tools link to private qualifications and the source-grounded research assistant. Library opens admissions guidance first, preserves destination/application tabs and browser history, and keeps exam preparation optional. Application rehearsal organizes preparation; it neither submits an application nor predicts acceptance.

Private writing has explicit save/version/restore/export; immutable education and test-result records are self-reported profile data. Notes and application dates use explicit Save, preserve dirty drafts after failure, validate real calendar dates and reuse client UUIDs for safe retries. Resource fetches use bounded recovery and visible retry. Summary counts reject partial/malformed responses instead of fabricating totals. Owner-and-generation checks guard delayed private results, including A→B→A account changes. Export includes full writing history through bounded pagination. The actual institution pages retain six understandable sections—Overview, Apply, Study, Costs, Rankings and Evidence—with older URL aliases preserved, current offers distinct from historical completions, and source/currency/population periods visible.

Discovery responses now use a compact public projection while full institutional detail remains available through profile reads. The measured same-24-profile payload fell from **1,543,860 to 540,924 bytes (64.96%)**; SSR fell from **2,253,517 to 995,140 bytes (55.84%)**. These are measured payload reductions, not an invented universal page-load time or a guarantee for every network/device.

The Supabase-style staff console retains **Overview, Catalogue, Review and Operations** as its four primary areas. Catalogue tools are grouped into Institution profiles, Admissions & study, Rankings & research, and Costs & funding. Operations groups Sources & pipelines separately from Accounts & administration. Contextual headings, grouped mobile selection, searchable tool labels/table identifiers, keyboard disclosures and empty-search recovery reduce clutter while preserving every existing entity, route alias and review workflow. Hidden staff access remains separate from student sign-in; visibility is not an authorization mechanism. Staff MCP keeps bounded contracts and reviewed staging authority, not arbitrary SQL or automatic publication.

## Applied schema and account-safety limits

These additive migrations are already present in the hosted migration ledger:

| Migration | Effect |
| --- | --- |
| `20261010041157_student_writing_versions.sql` | Owner-private immutable `writing_draft_versions`; SELECT/INSERT/DELETE, bounded text, no anonymous/staff-read policy or essay-body audit. |
| `20261010094202_structured_review_guard.sql` | Generic numeric approval rejects structured targets other than `data_points`; tuition and application dates require their section-specific review workflow. |
| `20261010180158_private_student_qualifications.sql` | Owner-private immutable `student_education` and `student_test_attempts`, existing profile FK, bounded inputs and server timestamps; no public/staff reading or automatic AI transmission. |

No duplicate normalized dataset tables or replacement database architecture were added. Staging and public data continue to use existing source/import/observation/programme equivalents.

The supported logout fix now checks the rendered owner **and session generation** before dispatch and after completion; stale callbacks cannot confirm success, clear the application's replacement account, or show the wrong success message. Installed `@supabase/auth-js` 2.116.0 defaults `signOut()` to **global** scope, so profile copy now says it signs out all sessions.

**A material SDK race remains.** A synthetic reproduction using the actual installed SDK shows: logout for A waits on its HTTP response; B signs in; A's late response causes the SDK itself to remove B's shared stored session. Application callbacks cannot prevent that internal SDK mutation. No private SDK patch or new auth architecture was introduced. Cross-tab coordination is not guaranteed, a permanently stalled SDK logout may retain the application invocation lock until reload, and already-issued JWTs remain valid until expiry. Evidence and exact limits are in [logout review](../outputs/signout-safety-review-oct11.md) and [SDK reproduction](../outputs/sdk-signout-race-oct11.json). [Supabase sign-out semantics](https://supabase.com/docs/reference/javascript/auth-signout).

Other explicit limits:

- Actual administrators can bypass application-only MFA/rate checks through direct Data API/RPC/Storage. The broader MFA proposal remains **uninstalled**, pending recovery/enrollment review; this is an admin-assurance gap, not a demonstrated student-to-admin escalation.
- Hosted leaked-password protection is disabled. OAuth buttons and setup status do not establish configured Google/Apple/Telegram providers, email delivery or hosted MFA/storage/private-account E2E.
- Active users cannot be inferred from profile counts or `updated_at`; consent-aware activity telemetry is not connected.
- Opt-in community, verified accepted-letter/story permissions, licensed full exam banks, durable full exam attempts and fully connected personal student AI remain incomplete.
- Global current admissions, certificates/prerequisites, costs, programmes, logos and galleries remain partial. No guessed acceptance probabilities, universal language thresholds or all-14k logo claim.

## Verification and reproducibility

Recorded current complete Node suite: **486 passing tests, zero failures**; typecheck passed. This includes seven logout guards and the new profile-cache regression work. The previous full Python suite passed **204 tests**; the final aid-extension ingestion count remains pending. The first Oct11 production build passed. **The final full lint and production-build reruns after projection and label changes remain pending root reconciliation.** Two earlier lint warnings were fixed, but the pending rerun must confirm that result.

Recorded browser evidence at preparation time:

| Verification | Actual result and limits |
| --- | --- |
| New landing sections | **28 checks, zero errors**, light/dark and widths down to 330 px; real public UI, real comparison selection, keyboard/touch folders and FAQ. |
| Staff simplification | **13 checks, zero errors, zero hosted writes**; actual anonymous denial plus intercepted synthetic authenticated staff/data fixtures. |
| Initial Oct11 scoped pass | **36 checks, zero errors** across illustration, public navigation, private-draft fixtures and PixelBlast motion preferences. |
| Resource library | **Nine checks, zero errors**; deliberately intercepted failure/retry, application tab/history and responsive states. |
| Comparison regressions | **Three checks, zero errors**; narrow heading and exact selected university preserved. |
| Public HTTP/search smoke | Latest [diagnostic](../outputs/http-search-diagnostic-oct11.txt) passes its routes and data checks; this does not validate private account writes. |
| Post-cache public THE identities/current programmes | **Nine checks, zero errors**, actual public read-only browser results after hosted repair; receipt in [profile-cache publication](../data/published/reviewed-profile-cache-oct11.json). |

Actual public/anonymous reads are distinguished from private synthetic fixtures. PGlite tests execute owner/privacy migration rules, but they are not proof of a real hosted-user OAuth, email, MFA, storage, deletion or writing round trip. No real student private data was seeded for browser tests. Local evidence is under `outputs/`, including the browser JSON, source refresh, SDK audit and test logs. Application deployment, repository publication, owner visual review and the final Obsidian synchronization are separate completion steps.

```sh
npm run typecheck
npm run lint
npm test
npm run test:data
npm run build
TEST_BASE_URL=http://localhost:5173 NODE_OPTIONS=--dns-result-order=ipv6first node tests/http-smoke.mjs

python3 scripts/database/review-national-publication-oct10.py --fetch-evidence
python3 scripts/database/prepare-reviewed-programmes-publication-oct10.py
python3 scripts/database/prepare-official-requirements-staging-oct10.py --fetch
python3 scripts/ingestion/apply-reviewed-ranking-identities-oct10.py --help
python3 scripts/ingestion/review-graduation-cohort-oct10.py --no-fetch --validate

PATH="/Users/likeanew/.local/bin:$PATH" node scripts/run-muse.mjs --list
PATH="/Users/likeanew/.local/bin:$PATH" node scripts/run-muse.mjs --task 45 --model 'opencode/muse-spark-1.3-contributor-free#xhigh' --dry-run
```

Review generator options and receipts before execution. They do not grant automatic publication. The programme publication preparer takes no CLI options and regenerates local review SQL with a new review timestamp; `--help` does not provide a help mode. That fresh artifact is not a replay of the already published receipt. Do not blindly replay applied hosted migrations, generated SQL, already published batches or new page hashes. Preserve exact source observations and create independently reviewed new observations rather than overwriting history.

## Actual Muse delegation

The requested OpenCode model remains **`opencode/muse-spark-1.3-contributor-free#xhigh`**, CLI v2.0.24. Ten additional actual jobs ran: **45, 47, 49, 50, 51, 52, 55, 56, 57 and 58**. Jobs 47/49/57/58 exited zero; 45/50/51/52/55/56 produced reports but exited one. Reports are research candidates, not a successful CLI completion or a publication receipt. Root independently corrected the SFA release interpretation and verified current ranking dates/permissions.

Automatic approval review blocked tasks **46 and 48** because their proposed file scope included staff/account code outside the approved external-model scope. They did not execute; native agents completed the affected presentation work. Task 39 was similarly blocked earlier. Tasks 53/54 were prepared but not run. The blocked staff/account file scope was not sent to Muse; credentials and private student records were excluded. See the [actual task ledger](OPENCODE-MUSE-1.3.md); prepared prompts and blocked jobs are not counted as completed work.
