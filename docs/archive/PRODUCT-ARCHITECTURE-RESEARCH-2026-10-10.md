# CollegeStat: research before implementation · 10 October 2026

This is a decision record, not a claim that the proposed dashboard, community or data imports are installed. It combines a repository/schema inventory, read-only hosted coverage, desktop/mobile browser inspection, a native-agent review, four Muse report attempts and primary-source research. The ranking research job was initially blocked by approval review; the owner subsequently authorized sending ranking code/docs only, and it ran with that restriction (report emitted; exit 1). No private student records, credentials or account files are part of the research jobs.

## What is actually installed

The existing React/Vinext app, Supabase/PostgreSQL schema, public URLs and identifiers remain the foundation. `outputs/architecture-inventory-oct10.txt` inventories app, data, migrations, ingestion, services, server and docs. `outputs/hosted-architecture-research-oct10.json` records aggregate counts and table columns; it contains no account names/emails/tokens. There are 14,003 published universities, not a need for a second 14k import. Only two account-profile rows exist; that is an account count, not a student or active-user metric.

Hosted verified coverage in this snapshot: 190 programme offers plus six held for review, 75 requirements, 967 admissions observations, 4,553 costs and 20 deadlines. These counts describe stored observations, not complete institution coverage. Six local/hosted ranking-source families are available: QS, THE, ARWU, Leiden indicators, NCSES HERD and NIRF. HERD is research expenditure; Leiden is selected scientific indicators; neither is a fabricated overall world university rank. Prior QS/THE/ARWU editions remain intact. Existing reviewed national publication has 855 linked observations across 829 institutions; unresolved combined units remain held.

Normalized equivalents already exist: `university_identifiers`, `university_programs` + `programs`, `university_admissions`, `university_requirements`, `university_deadlines`, `university_costs`, `scholarships`, `university_rankings`, research/data-point tables, media, `data_sources` and `source_records`. Reuse them instead of making duplicate generic tables. Programme/current-policy years can be null when unstated; the generic numeric staging queue requires a year and cannot safely stand in for all structured facts.

## Product decisions confirmed by the owner

- “uniinfo” means [uniRank](https://www.unirank.org/), not UNIRANKS or an unidentified provider.
- Profiles are private first, with a separate, explicitly opt-in community.
- Signed-in students use a compact dashboard for discovery, rankings, comparison, study resources, preparation and planning. Public pages remain available to visitors and existing URLs must keep working.
- Keep the approved floating glass navbar and centred text/search hero. Keep PixelBlast, meaningful pointer interaction, reduced-motion fallback and scroll text. Remove voice/mic controls from search surfaces. Do not reintroduce the rejected hero-image split or a pretend dashboard/question preview.
- Preserve the staff console's hidden entry and server/database role authorization. Hidden navigation does not confer security. Simplify staff tasks, preserve existing entities and review paths.
- Muse may handle bounded research or small isolated tasks; root controls the landing, data publication, authorization and architecture. No unrestricted agent SQL or automatic publication.

## One workspace, few primary destinations

Use **Home, Universities, Library and Prepare** as the four main icon + label destinations. Put Plan (tasks, application rehearsal and qualification checks) inside Prepare and show urgent personal tasks on Home. Profile/Settings and an opt-in community entry belong in account utilities, avoiding another primary navigation group. The native review suggested a fifth Plan item; this record folds it into Prepare to satisfy the owner's request for fewer sections without deleting its functions.

| Primary area | Secondary views | Existing implementation to reuse |
| --- | --- | --- |
| Home | Next task, recent research, resume a real saved draft | Owned workspace/checklist + immutable writing versions; no invented streak or score |
| Universities | Explore, Shortlist, Rankings, Compare; university profiles in the same shell | Explorer API + server filters, existing ranking editions, comparison rules/charts, full university profile |
| Library | Awards, research lists, notes, saved searches/history, official linked resources | Existing owned tables and learning-resource service; private uploads need a separate owner service |
| Prepare | Original exercises, writing, plan/tasks, application rehearsal, qualifications | StudentStudio, writing history, checklist, admission planner; do not call 12 original exercises an official question bank |
| Account utility | Private profile, preferences, qualifications, privacy; optional community | Existing owner RLS and profile services; sharing is a separate sanitized publication model |

Use one 220–240px desktop rail, one compact toolbar, clear selected view and a practical content column. A compact mobile drawer/bottom utility must preserve labels, focus management and Escape. No giant hero inside a working dashboard. Motion should acknowledge saved state, drawer changes and content transitions; it must not delay access to tables/forms.

Reuse views through workspace-context routes rather than copying the catalogue or sending students back to the website. Canonical destinations can live under `/dashboard/...`, with old `/dashboard?section=...`, `/saved`, public profile/ranking/compare URLs retained as aliases or external visitor entry points. Preserve query filters, comparison IDs and profile tabs when mapping routes. An authenticated layout is presentation, not authorization. Root `/` can direct a signed-in student to Home once account loading has resolved; never infer a server session from local preferences. Keep unsaved writing mounted on section changes or present an explicit safe leave/restore flow.

## University profile contract

The inspected MIT admissions page repeats entry requirements, requirement/date jump cards, application guidance, useful links, updates and historical panels. Use one primary requirements table, one application-round block and one document/checklist block. Keep historical evidence under a deliberate expandable section; keep every old tab link resolvable. Sparse profiles use the same section structure and honest missing states.

Every displayed fact needs the same fields: value and unit/currency, reporting year/period, population, programme/campus/category, provider + source URL, retrieval time, verification/review state and evidence/conditions. “Latest” means latest **within the same scope**, not the newest value from a different programme, cohort or test scale. Null means unknown. Published minimum, recommendation, optional evidence and exemption are separate states. An admissions rate describes its historical applicant population and never a personal chance of admission. A historical IPEDS completion is not a current degree offer. A single datapoint belongs in a clear value row, not an empty trend/donut chart.

Requirements should answer: which school qualification/curriculum, which subject prerequisites, whether a test is required/optional/conditional, accepted alternatives and waivers, documents, application route, fee, round/deadline and cycle. Programme and applicant category precede any “readiness” check. Fresh research candidates are not automatically verified imports.

## Source research and import boundaries

| Source | What research established | Action / limitation |
| --- | --- | --- |
| [uniRank about](https://www.unirank.org/about/) / [terms](https://www.unirank.org/terms/) | Non-academic web-popularity directory; terms require written permission for scraping/republication | Add a publisher reference; no table, logo harvest or university expansion from this source without permission |
| [CSIC Webometrics project](https://ipp.csic.es/es/webpage/ranking-web-universidades) | CSIC Cybermetrics Lab project points to webometrics.info; original ranking site unavailable during retrieval | Preserve source-review state and unknown edition; do not replace it with an independent similarly named publisher |
| [webometrics.org about](https://www.webometrics.org/about-us) | Independently operated by UNIRANKS, not proof of the CSIC ranking's current edition/licence | Keep publisher identities distinct; no automatic merge/import |
| [CWUR](https://www.cwur.org/about.php), [URAP](https://urapcenter.org/), [SCImago methodology](https://www.scimagoir.com/methodology.php) | Identifiable publishers; open redistribution permission not established in current source review | Existing external/restricted references remain honest; no manufactured missing rank |
| [Harvard international](https://college.harvard.edu/admissions/apply/international-applicants), [Waterloo English](https://uwaterloo.ca/future-students/admissions/english-language-requirements), [UBC English](https://you.ubc.ca/applying-ubc/requirements/english-language-competency/) | Official applicant-scope/English-condition sources; older and new TOEFL scales require explicit date/scale separation | Candidate evidence for scoped review, not a universal certificate rule or imported observation |
| UCAS, uni-assist, TUM, NUS, Khalifa, WIUT | Muse source report identifies official country/programme/cycle candidates and ambiguous pages | Independently verify the exact offer/population/cycle before staging; vague/conflicting deadlines remain held |
| [Waterloo brand downloads](https://uwaterloo.ca/brand/downloads-and-resources), [Harvard identity/trademark guidance](https://trademark.harvard.edu/pages/policies-forms) | Official institutional identity assets exist | Brand download availability is not blanket third-party reproduction permission; no logo from a medical-school sub-brand substituted for the institution |
| [Wikimedia reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia) | Per-file licence, creator and attribution matter | Preserve existing reviewed media and fallbacks; do not guess an unverified logo/photo or reuse a protected image to fill every record |

[OnePrep's official help centre](https://www.oneprep.com/help-center) organizes diagnosis, planning and practice; [its college page](https://www.oneprep.com/college) organizes academics, activities and application documents. These support a compact task-oriented workflow. Its private authenticated app was not accessed. Do not copy its branding, question content, chance predictions, example student records or outcome claims. Muse's workflow report could not retrieve its attempted OnePrep URL; root independently retrieved the correct primary pages listed here.

## Verified bugs / implementation priorities

1. **Account deletion race**: `pages-ui/profile.tsx` awaits session lookup without binding the initiating account generation. A replacement session can be consumed by an old form. Freeze initiating owner/generation/token; check after each await and before request/sign-out. Add delayed-session A→B and A→B→A tests; never test deletion on a real account. Save/clear completion needs the same ownership rule.
2. **Workspace truncation and coupled errors**: eight unordered `.limit(200)` reads, with any collection failure rejecting all, can silently hide older research. Use deterministic ordering, honest bounded/paged counts and independent collection states; keep a small home summary and load larger views on demand.
3. **Navigation state**: sidebar switches do not update URL. Back/refresh/bookmark should restore the current area/view. Preserve writing state when switching views.
4. **Voice removal**: navbar opens CommandPalette, which and HeroFinder still render VoiceSearch. Remove these consumer controls while preserving typing/search keyboard behavior.
5. **Media QA**: full-page captures before scrolling show unloaded lazy scholarship photos and QS mark. That does not prove a broken URL; explicitly scroll and wait for image decoding in QA before deciding whether the component fails. User-visible error handling and attribution remain required.
6. **Staff assurance**: browser writes check MFA, but the prior hosted audit found direct Data API/RPC/Storage assurance gaps and disabled leaked-password protection. No broad RLS/auth policy change is authorized by a design report alone without preserving recovery and testing the actual affected paths. Avoid claims that hidden staff entry solves this.

## Community and private student profiles

Keep qualification/test dates, grades, essays, documents, research and contact information private. Do not convert `profiles` or `auth.users` into a public directory. A future separate sharing record should contain only owner-selected display fields, a consent version/time and an explicit published switch defaulting false. Public reads must expose only that sanitized projection; revocation immediately removes its visibility. Do not publish exact birth dates, contact details, documents, grades or essays by default. Follow/report/block/moderation and age-appropriate defaults must exist before inviting community interaction. No synthetic “students” or invented acceptance-letter claims to populate the design.

## Staff and MCP design

Staff can use **Overview, Catalogue, Review and Operations**. Catalogue has one dataset selector, search/filter/paged grid and inspector; preserve entity URLs and validators. Review keeps before/after, identity/scope/history and source evidence. Operations contains sources/import jobs/audit/aggregate accounts/security/MCP. Registered-account counts must not be labelled active or online users. Staff must not receive access to private writing by virtue of a visual redesign.

The installed MCP endpoint is browser-oriented same-origin stateless JSON with five bounded read/staging tools. It does not offer general external OAuth discovery. Preserve authenticated role checks, MFA-gated staging, notifications that never execute tools, strict input validation, no SQL and no automatic publication. Improve typed output contracts and bounded evidence results; add pagination only when the runner/database supports it. Do not claim that changing a protocol string makes an external integration. [Primary MCP tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools), [transport specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports), [Supabase user-data guidance](https://supabase.com/docs/guides/auth/managing-user-data).

## Execution and acceptance

Research completed before application edits. First bounded implementation pass: initiating-owner protection; remove mic controls; add honest uniRank publisher metadata; integrate a compact authenticated shell and route/state mapping; improve MCP outputs without expanding authority. Root reviews all edits and tests. Later larger schema work (private dossier, persistent attempts, uploads and opt-in sharing) uses additive migrations and owner/RLS tests; no placeholders counted as working features.

Required checks: typecheck, lint, Node/Python tests and production build, then desktop/mobile/light/dark, keyboard/back/refresh, real image decoding, loading/error/missing states and account-switch tests. Anonymous dashboard-gate screenshots do not certify private dashboard or OAuth flows. The production build baseline completed successfully on 10 October before this implementation pass. Update the development checkpoint and actual Obsidian vault with installed results, held data, unresolved gaps and reproduction commands.

Supporting reports: `outputs/muse-ranking-research-oct10.md`, `outputs/dashboard-research-oct10.md`, `outputs/muse-student-workflow-research-oct10.md`, `outputs/muse-profile-sources-research-oct10.md`, `outputs/muse-staff-mcp-research-oct10.md`. Muse jobs 27, 28 and 29 emitted reports but exited 1; job 30 exited 0. Their recommendations require root review. No new dataset or assets were imported by this research.
