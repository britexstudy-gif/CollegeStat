# CollegeStat — verified development checkpoint, 10 October 2026

> **Superseded by the [11 October checkpoint](DEVELOPMENT-CHECKPOINT-2026-10-11.md).** The dated record below is preserved as history. Current public official offers are **195**: five of the six candidates below were independently reviewed and published; generic WIUT Economics remains held. Private qualifications were installed through the third additive migration, `20261010180158_private_student_qualifications.sql`. Two hosted THE profile caches were repaired without changing original ranking/source facts. Current complete Node tests: **486 passed**, typecheck passed; the earlier Python run passed **204**, with final aid-extension/lint/build reconciliation pending. New landing folders, comparison, evidence, FAQ and illustration sections and the four-area student/staff navigation are recorded in the newer checkpoint. Its source audit also distinguishes released THE 2027 from installed THE 2026 and confirms SFA2324 as **2023–24 provisional**. Do not reuse this page's older counts or states as current assertions.

This supersedes the [9 October evening checkpoint](EVENING-CHECKPOINT-2026-10-09.md). The existing React/Vinext/Supabase/PostgreSQL architecture, stable university IDs, URLs, original ranking values, source receipts and historical facts remain intact. Application changes are local and uncommitted. The hosted publications and migrations identified below actually reached the connected Supabase project; this is not an application deployment or repository push.

## Actual datasets and coverage

| Dataset | Current verified result | What changed today / limits |
| --- | --- | --- |
| University identities | **14,003 published institutions / 212 countries**, hosted and bundled | The earlier 5,003-identity expansion is preserved, not imported again. Identity coverage is not complete admissions coverage. |
| NCSES HERD FY2024 | **796 verified public expenditure positions / 796 profiles** | Reviewed and published existing private entries against exact UNITID, country/name, source workbook, permission and methodology evidence. Nine combined reporting units remain unlinked; expenditure is not a world university quality rank. |
| NIRF India 2025 | **59 verified public category positions / 33 profiles** | Published an exact reviewed selection; original categories, ties and positions remain intact. It is partial Indian coverage, not a global ordinal. |
| National publication total | **855 public entries / 829 distinct profiles / 14 enabled editions** | **184 source records remain pending** and four empty editions remain disabled. Five previously linked ambiguous/current-source-missing entries remain held. |
| QS/THE/ARWU | Existing **1,504 / 2,191 / 1,000** source rows, **4,820 linked / 377 unresolved** | No original positions, bands, ties, identifiers or source rows were changed. Exact original checksums were reverified. |
| Leiden Open | Existing **7,158 reviewed scientific-impact indicators** | No invented composite rank. QS/THE/ARWU/Leiden/HERD/NIRF are six installed data systems with different scopes. |
| IPEDS SFA2324 | Existing **44,600 public canonical facts / 2,469 universities / 19 metrics** | The 9 October publication is preserved. The reporting period remains **2023–2024**, with recipient/all-undergraduate/first-time scopes separate. |
| Official admissions staging | **Five new hosted private candidates** across Waterloo and WIUT | Three 2027 application/document dates, plus two separate 2026/27 domestic/international tuition facts. **Zero new public deadlines or costs.** Seven undated requirements remain local because a required source-record year must not be invented. |
| Current official degree pilot | **Six new hosted private offers**, all `needs_review` | WIUT Business Management, Economics, Finance; Waterloo Computer Science, Software Engineering, Data Science. Existing WIUT Computer Science is excluded as a duplicate. All reporting years/languages remain null. Three WIUT offers have explicit 36-month duration and September intake; Waterloo duration/intake remain unknown. **Zero new public offers.** |
| IPEDS GR2024 | **20,596 candidate facts / 10,298 source rows / 2,273 universities**, held | Zero new cohort resolutions or public graduation rates. Conflicting dictionary cohort years and missing fall/full-year reporter scope prevent publication. Four official instruction PDFs have receipts but no asserted extraction of their contents. |
| Official learning resources | Existing **19 hosted links: eight practice, eleven destination resources** | Khan Academy/College Board/Bluebook are official linked resources. **Zero protected question-bank items copied.** |
| Identity/media | Existing **11 official logos / 540 Wikimedia assets** in reviewed coverage | 3,171 unattributed candidates remain held; many identities still use honest fallbacks. No claim of a logo for every university. |

The national publication receipt is [data/published/national-publication-oct10.json](../data/published/national-publication-oct10.json). It includes exact entry mappings, held identifiers, edition state, permission-page/source hashes and executed SQL signatures. Original core ranking signature `3766cd60a4d0ac0dd5c060d8ba90b351` and original source signature `a2818b85c0764df2c43206c6eeb26492` are unchanged. Government source reuse evidence was checked against [NSF policy](https://www.nsf.gov/policies/digital), [HERD methodology](https://ncses.nsf.gov/surveys/higher-education-research-development/2024) and the [PIB policy](https://www.pib.gov.in/ContentPage.aspx?lang=2&menuid=102&reg=48). Preserve attribution and methodology qualifications on display.

The five private admissions facts are recorded in [data/review/official-admissions-staging-oct10.json](../data/review/official-admissions-staging-oct10.json). Waterloo Engineering excluding Architecture is distinct from other undergraduate programmes; application dates and document dates are distinct. No cutoff time or timezone was guessed from a calendar date. WIUT tuition cohorts retain domestic versus international scope and the separately corroborated academic period. Missing years remain null in candidates, not today's retrieval year. Source evidence includes [Waterloo deadlines](https://uwaterloo.ca/future-students/admissions/deadlines), [WIUT domestic fees](https://www.wiut.uz/tuition-fees) and [WIUT international fees](https://www.wiut.uz/tuition-fees-international).

CWUR, U.S. News, URAP, SCImago and Webometrics remain source/publisher references until an exact reusable dataset and redistribution permission are established. A card or link does not count as installed rank coverage. Additional institutions are reconciled through existing identifiers, not created once per ranking list. Acceptance rates, international proportions and academic requirements still have substantial coverage gaps.

The six private offers are recorded in [data/review/current-programmes-staging-oct10.json](../data/review/current-programmes-staging-oct10.json). Independent official-page heading/award evidence and actual hosted deduplication precede insertion. Existing English Computer Science and Master's Software Engineering definitions cannot be reused as unknown-language Bachelor offers. Existing `programs`, `university_programs` and `data_sources` are reused; no new equivalent schema, institution, source-record year or tuition amount is invented. SQL explicitly rejects duplicate NULL-language definitions and conflicting offers/receipts. Hosted anonymous-role verification returned zero visible candidate offers.

## Working product improvements

- Preserved the owner's six-link floating glass navbar and centred text/search hero; no rejected hero photo split or question/dashboard mock preview. PixelBlast spans the full hero, has stronger blue particles and a less opaque centre, remains interactive and pauses for hidden/offscreen/reduced-motion/save-data states. ParticleText assembles when visible, not only on hover.
- Hero search offers actual universities, country matches and full directory search with keyboard arrows/Enter/Escape, visible focus and clear controls. Requests are debounced, cancellable, limited to eight seconds and guarded against stale responses. Native form submission retains interpreted filters before hydration; suggestions failure does not block directory search.
- Public SSR cards are reused in either catalogue mode instead of immediately fetching them again. Account routes defer optional discovery data until public navigation. The command palette reuses featured cards for an empty query, skips one-character requests and cancels stale/timed-out suggestions; failure still leaves full directory search available.
- Featured university cards open real profiles and add/remove anonymous comparison selections. Existing five-university comparison and source/year/population/currency-aware charts remain intact.
- One scholarship section shows actual attributed campus photos, compact funding/eligibility/date information and working Featured/International/Full funding filters. Result counts are announced. Unknown international eligibility is not treated as true. The scrolled navbar has a readable light/dark fill over photographs and controls.
- The live OnePrep-inspired student shell retains real saved-university/task/plan routes, original practice and writing. Saved writing now has explicit **Save version**, safe retry, history pagination, confirmed restore, delete, per-format state and export. Command/Ctrl+S works in the editor. Failure preserves the editor text; account/session-generation guards reject stale A→B→A responses.
- Fixed native browser `fetch` invocation in checklist planning; detached dispatch keeps the correct receiver. Private writing and export use the same protection. Export includes all writing history through bounded pagination rather than silently omitting later rows.
- The Supabase-style staff grid retains rows during refresh, clamps shrinking pagination, handles malformed imports without losing drafts, confirms decisions with evidence, restores inspector focus and rejects stale file/editor/account completions. Logo upload errors reset busy state and cannot attach a completion to another account/record.
- Public national ranking/profile tables show **Scope**, exact edition, official source and verified state. Actual anonymous Harvard HERD and IIT Madras NIRF profile reads were checked. Different national/indicator systems are not shown as equivalent world ranks.
- Sign-in/register retain the attributed Toronto campus photograph and visible social-provider controls with honest setup status. Providers are not configured simply by drawing their buttons. No credentials, staff role promotions or real test-account writes were performed in this pass.

## Schema and publication safeguards

Applied additive migrations, using the existing hosted migration ledger timestamps:

1. `20261010041157_student_writing_versions.sql`: one owner-private immutable `writing_draft_versions` table, existing `profiles` FK, bounded text and owner/format/time index. Owned SELECT/INSERT/DELETE only; no UPDATE, anonymous privilege, staff-read policy, client-supplied timestamp or essay-body audit trigger. Explicitly saving creates history rather than replacing earlier versions.
2. `20261010094202_structured_review_guard.sql`: extends the existing `approve_observation(uuid)` guard. A staged structured target other than exactly `data_points` cannot pass through generic numeric approval. Costs with different populations and application dates require their section-specific review workflow. Existing role checks, ranking guard, function signature/grants, canonical history and audit remain intact.

HERD/NIRF were reviewed through guarded existing entry/source rows; no duplicate ranking tables were created. Private admissions were staged through existing sources/imports/source records. All new source facts carry source URL/provider, explicit reporting period when known, retrieval date, population/scope, state and hashed evidence. Anonymous visibility was verified after publication/staging.

Security metadata audit confirmed database-backed staff-role authorization, immutable owner-only writing and no writable signup role. Advisor notices for deliberately public UUID-only comparison sharing and denied direct rate-limit access are explained rather than silenced by broader grants. Two real gaps remain: **actual administrators can bypass the application's MFA/rate check via direct Data API/RPC/Storage calls**, and **hosted Auth leaked-password protection is disabled**. The broader locally tested MFA proposal remains uninstalled, with staff recovery/enrolment and owner configuration to review. This is an admin-assurance gap, not a student-to-admin escalation. See [Supabase password guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). No account data or settings were changed during the audit.

## Verification and evidence

Passing complete checks before final reconciliation: **267 Node tests, 178 Python ingestion tests, typecheck, lint and production build**. Scoped browser evidence: **16 landing**, **14 scholarships/destination/sign-in**, **16 writing**, **22 staff**, **eight anonymous national-ranking checks**, with zero page errors/ResizeObserver loops. Public HTTP smoke: **71 passed**. Final reruns after the hero/remaining staging changes are recorded below when completed.

Actual anonymous/public data, search and responsive rendering were tested. Private account/browser requests and upload/review responses used clearly marked synthetic fixtures; PostgreSQL owner/privacy tests execute the actual migration in PGlite. Synthetic fixtures are not a successful real hosted-user OAuth/MFA/writing/storage end-to-end test. No student's private writing or staff account was seeded.

Ignored local evidence includes `outputs/landing-oct10-browser.json`, `home-sections-oct10-browser.json`, `student-writing-browser-oct10.json`, `admin-quality-oct10-browser.json`, `national-public-browser-oct10.json`, `staff-security-audit-oct10.md`, committed-state hosted receipts and test/build logs. The usual preview is [localhost:5173](http://localhost:5173/). An interrupted/stopped server was confirmed absent before restarting it for final checks; browser connection failure was not hidden as a passing UI check.

## Reproduce, stage and sync

```sh
npm run typecheck
npm run lint
npm test
npm run test:data
npm run build
TEST_BASE_URL=http://localhost:5173 NODE_OPTIONS=--dns-result-order=ipv6first node tests/http-smoke.mjs

python3 scripts/database/review-national-publication-oct10.py --fetch-evidence
python3 scripts/ingestion/review-official-requirements-oct10.py --out outputs/official-requirements-oct10
python3 scripts/database/prepare-official-requirements-staging-oct10.py --fetch
python3 scripts/ingestion/review-current-degrees-oct10.py --out outputs/current-degrees-oct10
python3 scripts/database/prepare-current-programmes-staging-oct10.py --fetch
python3 scripts/ingestion/review-graduation-cohort-oct10.py --no-fetch --validate

PATH="/Users/likeanew/.local/bin:$PATH" node scripts/run-muse.mjs --task 23 --model 'opencode/muse-spark-1.3-contributor-free#xhigh'
# Tasks 24, 25 and 26 are separately scoped; inspect the prompts before running.
```

These generators create **review artifacts**, not automatic publication. Exact live preflights and source receipts are required before any insert-only sync. Re-fetching a page can change its hash and must not silently replace approved evidence. Migrations are already applied to this hosted project; apply in order to a new disposable development project first. Do not rerun applied migrations or publish a generated batch blindly.

## Muse and remaining work

OpenCode used the requested **`opencode/muse-spark-1.3-contributor-free#xhigh`**, without model substitution or auto-approval. Tasks 23 (official requirements), 25 (current degrees) and 26 (read-only loading audit) completed with exit zero. Task 24 emitted its report/tests but exited one; no new cohort fact was established and the full candidate set remains held. Task 26 identified heavy bundled layout imports and two extra request paths; root/native agents own the corrective implementation and browser checks. Its one public request failed while the server was stopped, so its report correctly makes no live timing claim. Older tasks 09–22 and the separate workflow job remain dated history; tasks 01–08 are prepared future work. Root independently reviews evidence and performs hosted publications; Muse does not change credentials or auto-publish.

Still incomplete: specialised tuition/deadline approval UI, complete global admissions/certificate/prerequisite/programme coverage, permitted additional ranking tables, logos for every institution, resolved GR2024 cohorts, real OAuth/email/storage/private E2E, persistent full exam attempts, licensed exam bank content, sourced accepted-letter examples, connected student AI and consent-aware active-user telemetry. Original mini exercises are not official scores or acceptance predictions. Owner visual review and production deployment remain separate steps.
