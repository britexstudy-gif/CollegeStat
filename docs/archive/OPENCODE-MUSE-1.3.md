# Muse 1.3 prompts through OpenCode

## 12 October 2026 — public research execution update

Tasks 59–68 produced ten public-source reports; all ten CLI attempts exited 1. A further requested batch of **100 university jobs** was actually attempted in an isolated public-only folder, ten concurrently. **38 reports were saved; zero CLI processes exited 0.** Many later jobs reported rate limiting. Reports are unverified research candidates, with zero automatically published facts. Exact ledger: `outputs/muse-public-100-oct12.json`; preserved report copies: `outputs/muse-public-universities-oct12/`; public task manifest: `data/review/muse-public-universities-oct12.json`. No API keys, repository code or private student/account records were sent. Additional calls are deferred while the provider is rate limited.

The [October 12 checkpoint](DEVELOPMENT-CHECKPOINT-2026-10-12.md) and [product-brief map](PRODUCT-BRIEF-IMPLEMENTATION-2026-10-12.md) distinguish implementation, preparation and actual hosted activation. Earlier dated ledger entries below remain history.

The public batch is now reproducible from the durable reviewed manifest, without depending on old `/tmp` prompts. It **prepares only by default**; execution needs `--run`. Each batch has a separate ledger and saved prompts/reports, preserving the original 100-attempt receipt. Concurrency is bounded to ten and each attempt to eight minutes. The original rate-limited batch is not automatically retried, and no output is automatically imported.

```sh
# Prepare public prompts only; no external model call
node scripts/run-public-muse-batch.mjs --limit 100

# Deliberately run one selected public task when the provider is available
node scripts/run-public-muse-batch.mjs --task 001 --run --concurrency 1
```


**Current ledger, 11 October 2026:** **58 prepared prompts; 46 actual execution attempts with reports** using installed OpenCode v2.0.24 and **`opencode/muse-spark-1.3-contributor-free#xhigh`**. The total consists of tasks 09–38, 40–45, 47, 49–52, 55–58 and the separately scoped landing-workflow job. Tasks 01–08, 53 and 54 remain prepared and unrun. Automatic approval review blocked 39, 46 and 48 before execution because their scope included private account/staff code outside the approved external-model scope; native agents completed that work locally. A report is not proof of CLI success, an accepted design or installed data. The ten newest executed jobs and their exact exits are recorded below. Root independently verified sources, corrected the SFA release interpretation and owns all live publications. The [11 October checkpoint](DEVELOPMENT-CHECKPOINT-2026-10-11.md) is authoritative for data, UI, verification and remaining safety gaps; the dated 10 October paragraph below is history.

Current verification, **10 October 2026**: installed OpenCode v2.0.24 exposes and ran the selected **`opencode/muse-spark-1.3-contributor-free#xhigh`** model. Tasks **09–30** ran, plus a separately scoped landing-workflow job (**23 actual run attempts/reports; 30 prepared prompts**). Tasks 23, 25, 26 and 30 exited zero. Tasks 24, 27, 28 and 29 emitted reports but exited one; report output is not a successful CLI completion. No new/public graduation fact or protected publisher dataset was established. Research task 27 was initially blocked by automatic approval review, then ran only after the owner explicitly authorized ranking code and docs; credentials, account files and private records were excluded. The [current checkpoint](DEVELOPMENT-CHECKPOINT-2026-10-10.md) records actual changes, publications, checks and remaining gaps. Tasks 01–08 remain prepared future work. Root replaced rejected landing changes and restored the owner's preferred navbar; a completed task does not mean every proposed design was accepted.

Historical 8 October inspection did not report a connected Muse model and started no external task. That earlier observation is superseded by the actual 9 October runs; no model substitution was used.

Use the exact Muse 1.3 identifier supplied by the connected provider. Select `xhigh` only if that provider exposes the variant. The visible model name alone is not a verified API identifier. Configure the intended provider through OpenCode's normal connection/login flow; keep credentials out of these files and the Obsidian vault. The installed CLI is authoritative when its flags differ from the current online documentation. [Official CLI reference](https://opencode.ai/docs/cli/), [model configuration](https://opencode.ai/docs/models/).

```sh
cd /Users/likeanew/Documents/CollegeStat/collegestat
opencode models
node scripts/run-muse.mjs --list

COLLEGESTAT_MUSE_MODEL='opencode/muse-spark-1.3-contributor-free#xhigh'
node scripts/run-muse.mjs --task 01 --model "$COLLEGESTAT_MUSE_MODEL" --dry-run
node scripts/run-muse.mjs --task 01 --model "$COLLEGESTAT_MUSE_MODEL"
```

The launcher passes structured arguments to OpenCode, attaches one prompt, uses the existing checkout and preserves normal permission handling. It does not use `--auto`, install providers, change credentials or run hosted migrations itself. The task may propose code/data changes; inspect the resulting diff and private import review before publication. Parallel jobs require disjoint file ownership and a root integration/review pass. Never run concurrent account sessions or overlapping mutations.

| Task | Prompt | Purpose |
| --- | --- | --- |
| 01 | [Database](opencode-prompts/01-database.md) | Inspect installed datasets, deepen every section, reconcile identities and stage reviewable imports. |
| 02 | [Staff console](opencode-prompts/02-admin-console.md) | Real database management, evidence review and consent-aware analytics. |
| 03 | [Practice backend](opencode-prompts/03-practice-backend.md) | Original/licensed questions, timed/resumable sessions and persistent results. |
| 04 | [Writing and profiles](opencode-prompts/04-writing-profiles.md) | Private drafts, versions, academic profiles and permitted outcome examples. |
| 05 | [Student AI](opencode-prompts/05-student-ai.md) | Owner-scoped tools, source-grounded advice, consent and budgets. |
| 06 | [Ranking sources](opencode-prompts/06-ranking-sources.md) | Exact provider/licence reconciliation, immutable editions and no invented ranks. |
| 07 | [Verification](opencode-prompts/07-verification.md) | Actual workflow, RLS, freshness, browser/build checks and Obsidian evidence. |
| 08 | [UI refinement](opencode-prompts/08-ui-refinement.md) | Screenshot-driven polish while keeping PixelBlast and working features. |
| 09 | [Dashboard/account](opencode-prompts/09-dashboard-account-oct09.md) | Completed live Today/search/history/mobile/staff refinements and campus photograph. |
| 10 | [Separate dashboard design](opencode-prompts/10-dashboard-design-review-oct09.md) | Completed reviewable prototype/research; artifact emitted but CLI exit 1; root browser QA passed. |
| 11 | [Comparison charts](opencode-prompts/11-comparison-charts-oct09.md) | Completed real-data bars, columns and coherent cost donuts. |
| 12 | [Identity/media audit](opencode-prompts/12-identity-media-audit-oct09.md) | Completed conservative logo/media/identifier review. |
| 13 | [University pages](opencode-prompts/13-university-pages-oct09.md) | Completed profile navigation, source clarity, responsive tables and empty states. |
| 14 | [Landing refinement](opencode-prompts/14-landing-refinement-oct09.md) | Completed scoped hierarchy, spacing, touch and motion refinements. |
| 15 | [Account flow audit](opencode-prompts/15-account-flow-audit-oct09.md) | Completed read-only audit and focused tests; root fixed bounded recovery and staff-session clarity. |
| 16 | [Student workspace](opencode-prompts/16-student-oneprep-redesign-oct09.md) | Compact OnePrep-inspired live shell; later native-agent integration adds actual Home actions and track routing. |
| 17 | [Staff console](opencode-prompts/17-admin-supabase-redesign-oct09.md) | Supabase-style live grid and navigation while retaining role/MFA access boundaries. |
| 18 | [Dashboard proposal revision](opencode-prompts/18-dashboard-review-replacement-oct09.md) | Separate reviewable concept; demonstration state remains separate from live data. |
| 19 | [IPEDS outcomes tests](opencode-prompts/19-ipeds-graduation-tests-oct09.md) | Adversarial parser/source tests; 20,596 local candidates remain review-only. |
| 20 | [Evidence-backed university tags](opencode-prompts/20-university-tags-evidence-oct09.md) | Checked 2,809 exact IPEDS ownership matches; no duplicate/correcting additions needed. |
| 21 | [Staff table polish](opencode-prompts/21-staff-table-polish-oct09.md) | Compact table, column-choice continuity, loading/empty distinction and record drawer. |
| 22 | [Account comfort](opencode-prompts/22-auth-comfort-oct09.md) | Scoped sign-in/register spacing and provider controls; root verifies themes/mobile and compacts photo. |
| 23 | [Official admissions](opencode-prompts/23-official-requirements-oct10.md) | Exit 0: twelve review candidates; root independently staged five dated fees/deadlines privately, held seven undated facts and added a structured approval guard. |
| 24 | [Graduation cohorts](opencode-prompts/24-graduation-cohort-review-oct10.md) | Report/tests emitted, CLI exit 1: all 20,596 candidate facts remain held; conflicting cohort definitions and missing reporter scope prevent guessing. |
| 25 | [Current degree pilot](opencode-prompts/25-current-degree-pilot-oct10.md) | Exit 0: six needs_review current offers, one installed duplicate excluded; unknown years/language remain null. Root reviews hosted staging separately. |
| 26 | [Preview loading audit](opencode-prompts/26-preview-loading-audit-oct10.md) | Exit 0: bounded read-only audit found heavy bundled layout imports and two duplicate request paths. Root/native agents implement and verify fixes; no Muse shared UI edits, credentials, server restart or hosted publication. |
| 27 | [Ranking licensing](opencode-prompts/27-ranking-licensing-research-oct10.md) | Report emitted, exit 1 after explicit owner permission for ranking code/docs only. uniRank terms require written reuse permission; CSIC Webometrics and independent publishers stay distinct. No imported ranks. |
| 28 | [Student workflow research](opencode-prompts/28-student-workflow-research-oct10.md) | Report emitted, exit 1; read-only research. Root independently retrieved OnePrep primary pages and owns the four-area persistent workspace implementation. |
| 29 | [Fresh profile sources](opencode-prompts/29-fresh-profile-source-research-oct10.md) | Report emitted, exit 1; official qualification/media candidates need exact cycle, programme, scope and licence review before staging. No data or assets imported. |
| 30 | [Staff MCP research](opencode-prompts/30-staff-mcp-research-oct10.md) | Exit 0 read-only report. Native-agent implementation adds five output contracts, bounded evidence and safe errors, preserving auth/MFA and review-only authority. |

## Subsequent execution ledger, 10–11 October

The following entries continue the dated history above. Scope was kept separate from root's account/security work and hosted publication. Earlier executed jobs have their reports/logs under `outputs/`; blocked jobs do not represent an external-model review.

| Task | Prompt | Actual result / review boundary |
| --- | --- | --- |
| 31 | [Student Home](opencode-prompts/31-student-home-research-first-oct10.md) | Executed/report: research-first student Home; native integration preserves real saved universities, tasks and optional preparation. |
| 32 | [University page review](opencode-prompts/32-university-page-design-review-oct10.md) | Executed/report: source-aware section design and clarity review; no new university facts established by design proposals. |
| 33 | [Private profile design](opencode-prompts/33-private-profile-design-oct10.md) | Executed/report: qualification/profile design proposal. Root owns authorization, actual schema and hosted migration. |
| 34 | [Campus media](opencode-prompts/34-campus-media-review-candidates-oct10.md) | Executed/report: candidate source/licence review. Root independently approved six attributed campus images; finding an image is not reuse permission. |
| 35 | [Performance review](opencode-prompts/35-performance-source-review-oct10.md) | Executed/report: source review and concrete loading observations; no universal timing guarantee. |
| 36 | [Directory loading](opencode-prompts/36-directory-loading-oct10.md) | Executed/report: directory loading fixes; root independently checks stale responses and account boundaries. |
| 37 | [Qualification UI](opencode-prompts/37-private-qualification-ui-oct10.md) | Executed/report: scoped academic profile UI. Actual owner-private persistence was independently integrated and tested. |
| 38 | [Qualification services/tests](opencode-prompts/38-private-qualification-service-tests-oct10.md) | Executed/report: qualification service/test work; root verifies actual migration/RLS and account generation behavior. |
| 39 | [Complete private export](opencode-prompts/39-complete-private-export-oct10.md) | **Blocked before execution by automatic approval review**: private account/export file scope. Root implemented/tested it locally; no Muse access to those files. |
| 40 | [Ranking interface review](opencode-prompts/40-ranking-interface-review-oct10.md) | Executed/report: labels, provider states and scope review; no publisher import. |
| 41 | [Ranking interface fixes](opencode-prompts/41-ranking-interface-fixes-oct10.md) | Executed/report: distinguish installed results, selected indicators, national comparisons and external references. |
| 42 | [THE identity review](opencode-prompts/42-the-identity-review-oct10.md) | Executed/report: exact original source identity review. Root independently repaired two hosted derived profile caches on Oct11; original ranks/source rows remain intact. |
| 43 | [Dashboard workflow](opencode-prompts/43-dashboard-workflow-review-oct11.md) | **Exit 0**, report. Workflow/research proposal; root implements and verifies private-account safety. |
| 44 | [Resource library](opencode-prompts/44-resource-library-ui-oct11.md) | **Exit 0**, report. Source-guidance/library UI; native integration adds bounded recovery, history preservation and keyboard/browser verification. |
| 45 | [Ranking freshness](opencode-prompts/45-ranking-freshness-oct11.md) | **Exit 1, report emitted.** Root independently verified released THE 2027, current Leiden/HERD/NIRF status and publisher reuse boundaries; zero newly imported restricted ranks. |
| 46 | [Staff navigation](opencode-prompts/46-staff-navigation-oct11.md) | **Blocked before execution by automatic approval review**: staff/account file scope. Native agent simplified the existing four-area console; 13 scoped browser checks passed. |
| 47 | [Public navigation](opencode-prompts/47-public-navigation-oct11.md) | **Exit 0**, report. Public navigation scope only; native integration preserves approved navbar, stable routes and responsive behavior. |
| 48 | [Folder interaction](opencode-prompts/48-folder-interaction-oct11.md) | **Blocked before execution by automatic approval review**: proposed imports led into private account/provider scope. Native agent restored the one three-folder section and verified touch/keyboard behavior. |
| 49 | [Licensed media](opencode-prompts/49-licensed-media-oct11.md) | **Exit 0**, report. Licence/source candidates, not an automatic image import or all-university logo guarantee. |
| 50 | [US release review](opencode-prompts/50-us-data-release-oct11.md) | **Exit 1, report emitted.** Root corrected its release interpretation against the actual cached dictionary: SFA2324 is **2023–24 provisional**, not a final file or proven SFA2425 release. |
| 51 | [European entry sources](opencode-prompts/51-europe-entry-sources-oct11.md) | **Exit 1, report emitted.** Official pathway/source research; certificates and dates are programme/applicant specific, not universal published requirements. |
| 52 | [Global entry sources](opencode-prompts/52-global-entry-sources-oct11.md) | **Exit 1, report emitted.** Official destination sources for Asia, Uzbekistan, UAE, Canada and US; source links do not count as installed admissions facts. |
| 53 | [Landing motion](opencode-prompts/53-landing-motion-oct11.md) | **Prepared, not run.** Native agents retained PixelBlast and verified reduced-motion/offscreen behavior. |
| 54 | [Comparison clarity](opencode-prompts/54-comparison-clarity-oct11.md) | **Prepared, not run.** Native agents implemented exact selection preservation and narrow-layout fixes. |
| 55 | [Practice source permission](opencode-prompts/55-practice-source-permission-oct11.md) | **Exit 1, report emitted.** Official links/licence review; zero copied Khan Academy/Bluebook question-bank questions. |
| 56 | [Privacy guidance](opencode-prompts/56-student-privacy-guidance-oct11.md) | **Exit 1, report emitted.** Documentation-only privacy guidance, no account files or private student records. |
| 57 | [Identity releases](opencode-prompts/57-identity-source-release-oct11.md) | **Exit 0**, report. Registry reconciliation/freshness opportunities; no automatic new profiles, guessed types or logos. |
| 58 | [Application design](opencode-prompts/58-application-design-patterns-oct11.md) | **Exit 0**, report. Reviewable application-tool design patterns; native/root integration adds useful private-profile/research entry points, not fabricated acceptance predictions. |

The latest ten report files are `outputs/muse-ranking-freshness-oct11.md`, `muse-public-navigation-oct11.md`, `muse-licensed-media-oct11.md`, `muse-us-data-release-oct11.md`, `muse-europe-entry-sources-oct11.md`, `muse-global-entry-sources-oct11.md`, `muse-practice-source-permission-oct11.md`, `muse-student-privacy-guidance-oct11.md`, `muse-identity-source-release-oct11.md` and `muse-application-design-patterns-oct11.md` (all under `outputs/`). Their CLI logs retain exits; none alone proves publication or accepted implementation.

The complete readable pack remains [MUSE-SPARK-1.3-XHIGH-PROMPTS.md](MUSE-SPARK-1.3-XHIGH-PROMPTS.md). Begin with the [11 October checkpoint](DEVELOPMENT-CHECKPOINT-2026-10-11.md); older checkpoints remain history. The separate student/staff design at http://localhost:5175/ does not replace the live dashboard. Muse jobs do not publish hosted data or change credentials. Root's reviewed SFA/resource/national/programme publications and private staging are documented separately with exact receipts. Automatic approval limits were respected; blocked scope was handled locally, not sent through a workaround.
