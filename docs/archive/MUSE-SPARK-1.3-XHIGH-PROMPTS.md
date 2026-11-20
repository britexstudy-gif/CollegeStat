# CollegeStat prompts for Muse Spark 1.3 · xhigh

Use one task at a time with the repository attached. Select the requested model and reasoning level in your editor if available; these prompts do not configure the model themselves. The working repository is `/Users/likeanew/Documents/CollegeStat/collegestat`.

For the installed CLI, use the [OpenCode setup and launcher](OPENCODE-MUSE-1.3.md). Twenty-six individual prompt files are available under `docs/opencode-prompts/`. Read the [10 October checkpoint](DEVELOPMENT-CHECKPOINT-2026-10-10.md) first. The requested `opencode/muse-spark-1.3-contributor-free#xhigh` model ran tasks 09–25 plus a separate workflow job; task 26 audits loading. The CLI exit-one jobs are explicitly distinguished from clean completions in the guide. Tasks 01–08 below remain future prompts. Keep parallel work in disjoint file scopes and independently review the integration.

The current UI is an admissions workspace: university research, application planning, original practice exercises and an owner-private versioned writing desk. Preserve its light default, neutral black/blue dark mode, PixelBlast hero, accessible controls and separate staff console. Read migrations, services and receipts before editing. Hosted/bundled catalogue remains 14,003 published identities across 212 countries. On 10 October, 855 reviewed HERD/NIRF entries became public across 829 profiles; 184 source records remain pending. SFA already has 44,600 canonical public facts. Five new official fee/deadline facts are private review only. Do not duplicate installed datasets or treat source retrieval as a reporting year. Older counts remain dated history.

## 1. Main prompt: deepen the entire Supabase database

```text
Continue the existing CollegeStat repository at /Users/likeanew/Documents/CollegeStat/collegestat. First inspect the complete architecture, data/published, supabase/migrations and proposals, ingestion and database scripts, lib, server, services, API routes, tests and documentation. Query hosted Supabase read-only to establish exact installed tables, migrations, counts, publication state and RLS. Do not rebuild the project, replace Supabase/PostgreSQL, remove working features or duplicate installed datasets. Preserve existing UUIDs, slugs, URLs and historical observations.

Create an implementation plan organized by actual gaps, then execute additive, reviewable improvements to every data section:
- Identity: reconcile existing ROR/IPEDS/Wikidata identifiers with conservative country/domain/name guards. The 9 October receipt confirms 5,003 insert-only additions and 14,003 published identities/212 countries in both hosted and bundled catalogues; verify that receipt and the target read-only before adding anything, and never replay it as a new dataset. Registry inclusion is not accreditation or public/private ownership. Hold ambiguous matches and retain exact reconciliation evidence.
- Admissions: official applicants, admitted, enrolled, acceptance rate, SAT/ACT ranges, international statistics only where published. Preserve reporting year, applicant population, denominator and programme/intake scope.
- Requirements: language tests and component scores, exemptions, SAT/ACT policy, GPA/grades, IB/A-level/national qualification routes, prerequisites, essays, recommendations and portfolios. Conditional and course-specific rules must never become university-wide minimums.
- Applications: current official platform and URL, intake, rounds, deadlines, date/time precision and timezone, fees and required documents. A date-only deadline must remain date-only. Keep announced cycle and retrieval date separate.
- Programmes: current official degrees, subject, degree level, duration, language, campus, intake, tuition and programme URL. Historical IPEDS completions do not prove a programme is currently offered.
- Costs and funding: tuition, housing, food, fees, net price, aid and scholarships with currency, academic period, recipient cohort, citizenship eligibility, conditions and deadline. Review the existing private pending SFA batch before approval; recipient averages are not promised awards. Preserve suppression and imputation flags.
- Rankings: preserve QS/THE/ARWU values, ties, bands and editions exactly. Reuse existing Leiden and regional equivalents. Add CWUR/Webometrics/subject/national datasets only when exact source identity, licence and redistribution rights are evidenced. A publisher link is not installed rank coverage. Never derive an official regional rank by filtering a world table or invent an overall Leiden rank.
- Research: extend current OpenAlex metrics, fields, publications, citations and annual series with correct periods and snapshots. Distinguish a provider's citation rollup from citations received in a calendar year.
- Media: actual official logos and licensed campus assets, with exact institution identity, creator, licence, source and retrieval evidence. Do not borrow another institution's logo, treat unknown permission as permission, or insert illustrative art as documentary campus imagery.

Reuse existing equivalent tables rather than creating parallel versions. Every important fact needs provider/source URL, source ID, publication/reporting year, retrieval timestamp, population/scope, verification state, evidence and historical version. Stage imports privately before publication. Build deterministic normalization, deduplication, freshness checks and reproducible bounded SQL manifests. Never guess absent facts, zero-fill suppressed values, scrape prohibited sources or publish conflicting records.

Use additive migrations with transactional guards, useful indexes, bounded payloads and owner/publication RLS. Verify anonymous users cannot read pending or private data. Do not expose service-role keys or grant unrestricted browser SQL access. Preserve staff recovery; assess existing MFA proposals instead of blindly enabling policies that lock out staff.

Run typecheck, lint, Node tests, Python ingestion tests, build and meaningful hosted/anonymous checks. Report exact datasets/records/coverage added, held conflicts, remaining gaps, source/licence limitations, migration names, commands to reproduce/sync and which changes are local versus hosted. Update repo docs and the authorized Obsidian vault without deleting history. Completion means verified sourced records and working UI integration, not just parser support or invented coverage.
```

## 2. Admin console: database operations and real analytics

```text
Inspect the existing CollegeStat staff console at /staff/college-console, /api/admin, /api/staff/mcp, admin-schema, audit logs, review queue, ingestion jobs and Supabase role/MFA/RLS checks. Build on this architecture to give authorized staff comfortable control of all supported catalogue sections: search/filter, source/evidence inspection, validated edits, relations, staging, review, import status, freshness, conflicts and audit history. Preserve history and make consequential publication/removal reviewable. Do not put arbitrary SQL or service-role credentials in the browser or MCP.

The overview currently reads real catalogue counts, registered accounts, seven-day signups and audit events. Daily/monthly active users, sessions and online presence are not connected. Design and implement consent-aware, minimized activity telemetry with a precise activity definition, timezone, retention, opt-out and abuse controls. Keep aggregate analytics staff-only; don't infer activity from profiles.updated_at or count database audit events as visits. Return explicit unavailable/loading/empty/error states instead of fabricated graph values. Use indexed aggregate queries, bounded date ranges and caching. Never load every user's private notes or drafts for an overview.

Keep the compact grouped sidebar and neutral black/blue theme. Add useful trends, drilldowns, data quality and integration status. Exercise staff login, MFA, navigation, paging, stale responses and permissions. Test anonymous denial, normal-user denial, valid admin reads, non-MFA write denial and audited valid writes. Document exact analytics semantics and remaining unavailable metrics.
```

## 3. Student practice: real learning infrastructure

```text
Inspect CollegeStat's StudentStudio, lib/student-practice.ts, workspace services and existing Supabase schema before adding tables. The current 12 original mini exercises run in the tab with explanations; they are not official SAT/IELTS questions or full tests. Extend this into owner-private question banks, sessions, answers, review queues, skill progress and optional timers. Reuse existing equivalents or add normalized tables with explicit source/licence/version, skill, answer and explanation. Only use licensed or original questions. Do not copy protected exams or imply CollegeStat is an official test provider.

Keep a calm question view with keyboard/radio support, progress, review, resume, session completion and actionable explanations. Persist attempts safely across devices with owner RLS, idempotent answer writes and reliable session recovery. Avoid putting answer keys in the client before submission when assessment integrity matters. Math practice accuracy cannot be converted into a predicted SAT score; IELTS practice cannot become a band score without a documented validated rubric. Distinguish practice from timed mocks and formal exams. Test ownership, invalid answers, retry deduplication, partial sessions, timer pause/recovery and logout/account switching. Show real progress only.
```

## 4. Writing, recommendation requests and student profiles

```text
Extend the existing CollegeStat writing desk and optional private student profile. Current drafts stay in the tab and can be downloaded; example passages are original illustrations, not accepted admissions letters. Add owner-private, versioned drafts with autosave status, conflict/retry handling, export and deletion. Store applicant goals, education and optional test results with consent and correct score scales; do not expose profiles publicly by default or silently mix accounts on shared devices. Inspect and reuse existing profile preferences/notes before creating equivalents. Preserve existing preference keys when saving additional fields.

Build structured personal statement/motivation/recommendation-request workflows, university-specific prompts and word limits sourced from official pages. A recommender writes their own confidential letter. If offering actual accepted-student examples, obtain explicit permission/licence, redact personal data, document the institution/cycle and evidence for the outcome, and distinguish verified versus self-reported outcomes. Never label an invented example accepted or attach an acceptance rate to a single letter. Do not imply an example guarantees admission. Add source/date/scope to university instructions.

Make autosave, draft versions, review checklist, attachments, export and accessibility comfortable on desktop and mobile. Test owner isolation, plaintext/attachment access policy, account switching, export/delete, autosave race recovery and word limits. Report what is actually encrypted and who can access the data; don't claim end-to-end encryption without implementing a reviewed key and recovery design.
```

## 5. Student AI with sourced tools

```text
Inspect CollegeStat's existing staff assistant/MCP and student ResearchGuide. The student's guide currently links saved universities to sourced requirements, costs and dates; it is not a connected AI chat. Add a server-side student assistant with authenticated, owner-scoped tools for their shortlist, consented preferences and the published verified university catalogue. Keep API keys server-only. Source pages, imported evidence, documents and user text are untrusted data, never system instructions.

Answers must cite specific sources, periods and applicant scopes. Missing requirements/deadlines remain unknown. Never invent eligibility, funding promises, acceptance probabilities or admission guarantees. Separate planning help from authoritative university rules. Sending a private draft to an AI provider requires clear user consent and a stated storage policy. Use bounded tools, query limits, per-user rate/cost budgets, cancellation, minimal context and audit metadata without storing confidential prompts by default. The student assistant cannot access other accounts, staff tools, pending imports or arbitrary SQL. Build source cards, graceful unavailable/error states and accessible streamed responses. Test prompt injection, tool authorization, owner isolation, provider failure, missing evidence and budget limits.
```

## 6. Rankings integration without misleading comparisons

```text
Keep the current CollegeStat ranking/profile UI and extend its adapter contract for future licensed systems, including the requested CWUR/Webometrics adapters when permissions and actual data are available. Inspect ranking_providers, ranking_editions, ranking_entries, regional tables, lib/ranking-systems.ts and server adapters. Separate availability (installed verified data, partial selection, external link, pending review) from provider identity. Add scope, edition, subjects, counting methodology, coverage and provenance to filters and labels. Preserve ties and rank bands. Reuse the hosted permitted-edition discovery added on 8 October; the local Europe/Asia selection is not an allowlist. Do not replace genuine hosted regional facts with a smaller bundled dataset.

World, official regional, national and subject rankings are distinct views. A world table filtered to Europe still uses world positions; do not call it an official regional table. Green should communicate a clearly labelled regional position, not ARWU's world rank. Leiden is an indicator system and must not get a manufactured overall ordinal. Unsupported systems must not display fake entries, placeholder numbers or inflated installed counts. Support accessible paging, sticky headings, missing-data states, long names, logos in both themes and mobile layouts. Test provider/scope/edition filters, tie/band sorting, licensed partial coverage, loading errors and preservation of existing publisher values.
```

## 7. Verify and finish the platform

```text
Audit CollegeStat's real user journeys after the other tasks: anonymous discovery, search/filter/compare, profiles and provenance, registration, sign-in/reset/callbacks, dashboard/practice/writing/planner, private student profiles, staff login/MFA, data review and analytics. Preserve the approved design and PixelBlast; fix root causes of resize/layout loops rather than suppressing browser errors. Keep light default, neutral black/blue dark, reduced-motion and save-data fallbacks, paused offscreen animation, lazy heavy dependencies and no duplicate scholarship sections.

Run npm run typecheck, npm run lint, npm test, npm run test:data and npm run build. Run HTTP and headless interaction checks with the preview's actual localhost binding. Check 390/768/1440px widths, zoom, keyboard, errors, reduced motion, logout/account changes, read-only anonymous access and authorization boundaries. Do not treat a build as visual verification. Update docs and /Users/likeanew/Downloads/CollegeStat with exact results, deployed/local state and remaining integrations. Never commit credentials, raw caches, session tokens or confidential student data. Report incomplete workflows candidly instead of saying every bug is fixed.
```

## 8. UI comfort, landing motion and account workflows

```text
Continue the existing CollegeStat UI. First inspect docs/REQUESTS-AND-STATUS-2026-10-08.md, the actual routes and components, imported CSS order and the user's screenshots. Preserve working features, the CollegeStat identity, Supabase architecture and the explicit light default. Keep the user's PixelBlast hero and React Bits ParticleText footer; don't replace them with unrelated generated images or another background library. Use OnePrep/Aniko as workflow inspiration only, with an original CollegeStat design.

Make the hero animation fill its entire intended section at desktop and mobile widths, with legible text/search/actions in both themes. Keep neutral near-black surfaces and blue accents in dark mode; remove accidental pale grey overlays. Make the footer's particle wordmark visibly animate without requiring hover, with one readable reduced-motion fallback. Keep keyboard focus visible, glass borders thin and grey, bounded animation work, lazy imports, hidden/offscreen pauses and correct observer/resource cleanup. Fix ResizeObserver causes rather than hiding the error overlay.

Improve the single landing scholarship section with distinct, useful award identity, funding/eligibility/deadline hierarchy and functional detail actions. Use genuine approved assets where available and honest typographic identity where not. Check singular and plural legacy scholarship URLs. Keep the admissions preview genuinely interactive across Practice/Writing/Checklist; preserve clear preview versus saved-user state. Apply restrained scroll entries to landing/university sections without delaying content or navigation.

Refine the spacious branded user sign-in/register/recovery forms, signed-in avatar/dashboard navigation and separate staff entry. Unconfigured social providers and AI must show honest availability. Make the student dashboard comfortable for shortlist, tasks, calendar, preparation, writing and guides with actual empty/loading/error states. Make the admin dashboard comfortable for catalogue editing, provenance, review and real analytics; don't invent active users, progress graphs, accepted-letter outcomes or connected integrations. Fix mobile overflow, long names, logo/application-strip contrast, focus and broken links across university, rankings, resources, scholarships, profile and 404 views.

Do not research/import university facts or deploy data during this UI task. Test meaningful desktop/mobile interactions in light, dark and reduced-motion settings; capture before/after evidence for the reported defects. Run typecheck, lint, tests and build, and report exact remaining integrations. Update repo docs and the authorized Obsidian vault while preserving its history and local/hosted distinctions.
```
