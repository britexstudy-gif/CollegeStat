# Product brief → existing CollegeStat — 12 October 2026

The owner's [pasted product brief](PRODUCT-BRIEF-2026-10-12.md) is the roadmap. Its sample students, requirements and scores are illustrative, not real facts. Its proposed tables are logical groups; reuse current normalized equivalents. Keep the existing React/Vinext, Supabase and PostgreSQL architecture, canonical university IDs and all historical observations.

The brief describes eight connected product areas. Existing navigation groups related tools to keep the sidebar usable; a roadmap item is not reported as completed merely because a navigation link exists.

| Brief area | Current useful behavior | Remaining work |
|---|---|---|
| Dashboard | Private shortlist, application checklist, dates, research lists, notes and next steps | Cross-device learning progress, intake-specific preparation calendar and evidence-based recommendations |
| Universities | 14,003 published identities, sourced profiles, current programme offers, admissions, costs, research, comparisons and source drawers | Much broader programme/applicant-specific requirements, fresh verified statistics, permitted logos/gallery assets and structured faculty/alumni relationships |
| Academics | Certificate/qualification hub, exact private scores/scales, official provider links and optional original exercises | Licensed or original comprehensive banks, adaptive learning, persistent skill progress and validated mock exams |
| Applications | Source-linked country routes, independent rehearsal, private writing versions, checklist/tasks and official submission links | Full versioned application templates, programme-level eligibility evaluation, document workflow and consented integrations |
| Community | Private-by-default profile foundation; no invented accepted students or outcomes | Separate opt-in public projection, field consent, moderation, review standards and real contributor permissions |
| Knowledge Hub | 16 original source-aware articles, six topics, search, reader contents/checklists/related reading; public Resources redirects to Articles | Hosted article drafts, revisions, editorial review and admin publishing |
| AI Advisor | Authenticated, bounded, consented server architecture with public evidence and four task types | Owner requested API keys remain disconnected. No live private-profile reading, fabricated answers or acceptance predictions |
| My Profile | Own private preferences, education and test attempts; immutable owner and exact score scales | Achievements, extracurriculars/projects and explicit reuse consent across additional workflows |

## Admin and support

Keep four primary staff areas: Overview, Catalogue, Review and Operations. Group existing tools underneath. The new Inbox belongs under Review; the database Structure preview belongs under Operations. The structure preview shows allowlisted columns, relationships and policy summaries, never student rows, secrets or a SQL executor.

Authenticator verification is a separate gate from having the database admin role. The new session boundary requires a verified TOTP factor, a live Supabase session and a fresh verification. Fifteen idle minutes end access; background jobs do not renew it. Existing full audit snapshots remain unchanged. Additive session protection, the inbox and structure preview are now installed; the shared catalogue role helper was deliberately preserved after automatic approval review rejected the wider change.

The owner subsequently chose **“Keep the current app protection.”** The broader `staff-global-enforcement-oct12.sql` proposal will remain uninstalled. Existing catalogue direct-API/RLS/RPC permissions remain role-based; the app APIs, new inbox and structure preview independently require the active authenticator ledger.

Public Contact us and the visible student Report a problem control use the same private inbox. Guest email is sender-provided, not verified. Staff can mark a message in progress/resolved and keep internal notes. Neither submission nor a review automatically sends email. No private profile, screenshot, browser diagnostics or query-string tokens are automatically attached.

## Ranking/data boundaries

Existing QS/THE/ARWU values and historical editions remain exact. Leiden publishes distinct scientific-impact indicators, not a composite overall rank. HERD is a US research-expenditure measure; NIRF positions retain the Indian category. Neither is relabelled as a global academic rank.

uniRank/Webometrics/CWUR/URAP/SCImago/U.S. News references and connector readiness do not mean their complete tables are imported. Keep each publisher's reuse status, identity, cycle and missing coverage explicit. A university absent from a publisher's table cannot be assigned a manufactured position.

Two missing hosted publisher identities were registered on October 12: **CWUR and uniRank**, both marked restricted. Read-back confirmed zero editions and zero ranking entries for these new provider rows. Their official permission/copyright links are retained in `data/review/ranking-provider-metadata-oct12.json`; no university identities, positions or images were imported from them.

The 100 new Muse public-university jobs were attempted in an isolated folder, ten at a time. They produced 38 reports; all processes returned exit 1 and many remaining jobs reported rate limiting. Reports are unverified research candidates, with zero automatically published records. No repository code, credentials or student records were in the prompts. Review and validate each exact institution/source before imports. The saved manifest is `data/review/muse-public-universities-oct12.json`, with reports in `outputs/muse-public-universities-oct12/`.

The supplied OpenRouter project ID identifies the owner's key project but is not an authentication mechanism. No OpenRouter account settings or API keys were changed, and no project access is claimed from that ID alone.
