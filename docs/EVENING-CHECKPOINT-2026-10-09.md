# CollegeStat — evening checkpoint, 9 October 2026

**Superseded by the [10 October verified checkpoint](DEVELOPMENT-CHECKPOINT-2026-10-10.md):** 855 national entries are now public; five dated admissions candidates are privately staged; writing versions and structured review safeguards are applied. This document preserves the 9 October state and is not the current pending count.

This supersedes the earlier [9 October checkpoint](DEVELOPMENT-CHECKPOINT-2026-10-09.md). The existing React/Vinext/Supabase/PostgreSQL application, URLs, account policies and historical observations are preserved. Application changes are local and uncommitted; the database publications below actually reached the connected hosted project. No application deployment or repository push is claimed.

## Published data, with exact coverage

| Dataset | Installed result | Limits |
| --- | --- | --- |
| University directory | **14,003 published identities / 212 countries**, unchanged from the earlier verified 5,003-identity expansion | Registry identity is not a complete admissions profile, accreditation or ownership determination. |
| IPEDS SFA2324 | **44,600 verified canonical observations / 2,469 universities / 19 distinct metrics**, now public on hosted PostgreSQL | **2023–2024 academic year**, with all-undergraduate and first-time cohorts kept separate. Recipient averages are historical, not promised awards or international eligibility. |
| Official learning/application resources | **19 published links: 8 practice / 11 destination resources** | Authored summaries, official URLs, provider, retrieval date, population, steps and evidence. **Zero copied question-bank items.** |
| US ownership review | 2,809 exact unique installed IPEDS identities checked: 907 public / 1,902 private | All matched existing classifications; **zero new or correcting tags**. Ambiguous/missing identities remain held. |

SFA was already installed as a private source receipt. It was **reviewed and published, not downloaded or duplicated again**. Source and dictionary archive checksums, each field definition, reporting flag, population, period, year, notes and 44,600 values matched the hosted source records before publication. Only `R` (reported) and `Z` (implied zero) fields were eligible. Imputed, missing, negative, unsupported or suppressed fields remain excluded. The publication transaction refuses conflicting canonical facts, inserts stable observation IDs, retains original retrieval dates and links every fact to its source observation. It never overwrites earlier facts.

The source/hosted value signature remains **`87c27d5e550d2f11e9e7bf2b272a4b70`** after publication. An independent committed-state query confirmed all 44,600 source links, 2,469 institutions, 19 metrics and zero remaining pending records in this SFA import. The transport timed out after the long transaction; the verified committed transaction was **not repeated**. Anonymous Harvard profile retrieval exposes all 19 aid observations; the Costs & funding section presents four useful sourced facts with year/population and access to evidence.

The resource catalogue includes official Khan Academy SAT, College Board Bluebook/question-bank references, IELTS/ETS resources, and official destination systems including EducationUSA, UCAS, DAAD, Campus France, Sweden, Canada, NUS, HKUST, UZBMB, WIUT and UAE guidance. It installs link metadata, not commercially reusable exam questions. General destination guidance is not a university-specific eligibility determination. Older source publications stay labeled with their own year; retrieval does not make them current requirements.

## Live UI and working functions

- **Landing:** restored the owner's earlier six-link floating glass navbar; centered headline and search; removed the rejected hero campus-image section and dashboard/question mock preview. Full-width, denser interactive PixelBlast remains, with bounded resizing, offscreen pauses and reduced-motion fallback. One scholarship section uses actual attributed campus media. A practical destination selector replaces the rejected preview; four installed world/research publishers and two national source links remain distinct. Scroll text, carousel, account CTA and particle footer remain.
- **Navigation/search:** the mobile menu contains all six routes plus Data sources, supports Escape and restores focus. Desktop routes, active states, command search, theme and account navigation remain. The hero now has a native server-interpreted search fallback: pressing Enter before client hydration still opens the correct university/country filters instead of submitting back to the landing page.
- **Student dashboard:** compact OnePrep-inspired navigation and utility bar, four useful subject cards linked to actual original exercises/writing, real task/deadline actions, College finder, saved research, comparisons, lists and history. The calendar belongs in My plan. All eleven sections and mobile drawer behavior were exercised with synthetic account fixtures. There are 4 original math, 4 reading and 4 English exercises, plus 3 writing prompts—not an imported SAT/IELTS bank or official score prediction.
- **Staff console:** compact Supabase-style semantic table, retained visible-column choices through pagination, useful priority columns, separate loading/empty states, record drawer and neutral dark theme. Staff entry stays out of public navigation; existing server role/MFA gates and RLS remain. Unconnected active-user telemetry is not fabricated.
- **University pages:** practical sourced admissions, application, requirements, current-program and cost summaries; all nine tabs and historical sources retained. Ranking details and application-platform details belong in their dedicated sections. Optional research charts require comparable facts. New historical aid context shows exact cohorts and recipient averages, rather than merging them into generic aid claims. Real Harvard profile sections were checked at 330–1440 widths.
- **Sign-in/register:** actual credited Toronto campus photograph, readable form hierarchy, aligned Google/Apple/Telegram controls, password visibility, recovery and magic-link flows preserved. Mobile photo and credit are compact so they do not delay the form. Social options honestly show **Setup required** until the owner configures the providers; no successful OAuth integration is invented.
- **Resources/application rehearsal:** source-linked destination guidance, practice resources and an editable application checklist. Users supply university/program/intake context and explicitly save tasks to their private `user_checklist`. This is a planning rehearsal, not a chance-of-admission or credential evaluation. Existing guides/budget/timeline remain available.

## Safety and quality fixes

Application checklist saves capture the account and bearer token before awaiting; account switches invalidate stale responses, including A→B→A changes. Requests never relabel an old draft as a new owner's task. Titles are bounded to the actual 300-character database limit, contextual inputs are bounded, and existing tasks are deduplicated. Both new rehearsal saves and existing Resources guide saves use the same owner-safe service.

Resource normalization ignores malformed retrieval dates instead of allowing them to pin an older record as latest. The new database constraint requires the **JSON boolean** `content_imported: false`; missing, null, true and the string `"false"` cannot bypass it. Anonymous readers see only published verified resource versions. History is retained; students cannot publish or edit catalogue rows. The existing ranking-review guard still rejects generic approval of staged ranking facts.

## Schema and reproducibility

Applied additive migration **`supabase/migrations/20261009180028_learning_resources.sql`**. Its local version matches the actual hosted migration ledger. It reuses `data_sources`, the existing admin role predicate and audit mechanism, adds versioned resource metadata with source/evidence constraints and RLS, and introduces no replacement university/program/ranking schema.

SFA publication reuses `source_records`, `data_points` and `data_sources`; **no new aid table or destructive migration** was required. Earlier October 9 explorer, home summary and ranking-review migrations remain installed.

```sh
cd /Users/likeanew/Documents/CollegeStat/collegestat
npm run typecheck
npm run lint
npm test
npm run test:data
npm run build
TEST_BASE_URL=http://localhost:5173 node tests/http-smoke.mjs

# Reproduce review artifacts; these commands do not publish automatically.
python3 scripts/database/prepare-aid-publication-oct09.py --out outputs/aid-sync-review
python3 scripts/ingestion/build-study-resources-oct09.py
python3 scripts/database/prepare-learning-resources-oct09.py --out outputs/resource-sync-review
python3 scripts/ingestion/review-university-tags-oct09.py --help
node scripts/run-muse.mjs --list
node scripts/run-muse.mjs --task 22 --model 'opencode/muse-spark-1.3-contributor-free#xhigh' --dry-run
```

Inspect generated manifests and checksum receipts before applying SQL to another authorized target. Aid SQL requires the exact installed private SFA receipt and refuses parity/conflict failures. Resource SQL reuses exact source URLs and inserts new versions without overwriting older ones. Do not reinstall the 5,003 directory identities or automatically publish pending national/graduate-outcome records.

Useful receipts are in ignored `outputs/reviewed-aid-publication-oct09/`, `outputs/learning-resources-publication-oct09/`, `outputs/public-aid-api-oct09.json`, `outputs/navbar-root-functional-oct09.json`, `outputs/auth-public-final-oct09.json`, and the student/university evening browser reports. They contain source/verification results and synthetic fixture outcomes, not account passwords.

## Delegation, verification and remaining work

**Tasks 09–22 ran through the actual Muse Spark 1.3 xhigh OpenCode model**, plus one narrowly scoped landing-workflow job (15 reports). Tasks 01–08 are prepared future prompts. Native subagents handled the live student/profile integration and account/planner tests. Root directly replaced the rejected landing design, restored the preferred navbar, reviewed publication evidence, fixed additional issues and performed integration checks. The separate localhost:5175 design remains a proposal, not a live-data dashboard.

Typecheck, lint, **220 application tests**, **103 Python ingestion tests**, **production build** and **all 71 public HTTP checks** passed. The HTTP assertions now exercise ranking/application details in their dedicated sections and official destination guidance in place of the rejected mock preview; native pre-hydration search is also checked. The final public navbar/hero audit passed **23 checks** with zero page errors, including five widths, all mobile routes, keyboard search/focus, theme, resizing and reduced motion. Sign-in/register passed both themes at 330/390/1440 widths, password controls and public resource retrieval (**13 checks**, zero page errors). Anonymous Harvard aid passed: 19 sourced records, four displayed facts, 330/390/900/1440 fit and zero errors. The focused resource/planner/schema suite includes 36 cases, including account races and actual PostgreSQL policy/constraint behavior. Browser checks do not establish actual third-party OAuth/email delivery.

The final build completed successfully, retaining the framework's route-classification and optional large-chunk warnings. A directory page-2 request succeeded in 4,852 ms after the transient import-period failure; this is a cold development/network observation, not a promise that every request is instant. The earlier server import/cache optimizations remain in place.

Remaining limits: full licensed Webometrics/CWUR/SCImago/URAP/U.S. News tables are not installed by assumption. QS/THE/ARWU remain exact; Leiden indicators do not gain an invented overall rank. HERD/NIRF reviewed source previews remain separate from 1,039 pending hosted source records, 860 needs-review entries and 18 publication-disabled editions. The 20,596 graduation/outcome candidates remain review-only because reporting/cohort definitions need resolution. No claim of an official logo for every university, complete worldwide admissions requirements or acceptance rates is made.

Current private end-to-end layout checks use **synthetic intercepted fixtures**. The stored real QA password was rejected earlier; it was not reset or promoted. Actual OAuth/email delivery, persistent full exam sessions/scoring, versioned writing, permitted accepted-student examples, student AI and consent-aware active-user analytics remain backend/integration work. The separate uninstalled database MFA proposal stays uninstalled. Cold hosted loads still depend on network/database conditions; a transient directory 503 remains a recorded observation rather than being hidden behind fake data.
