# CollegeStat checkpoint — 12 October 2026

The [product brief](PRODUCT-BRIEF-2026-10-12.md) and [implementation map](PRODUCT-BRIEF-IMPLEMENTATION-2026-10-12.md) are incorporated into the existing repository. No rebuild, replacement database, fabricated ranking or private-profile sharing was performed.

## Completed local product changes

- Public Resources is now Articles, retaining legacy redirects. Six existing original guides were expanded and ten added: **16 total**, six topics, search, scope/year notes, contents, official references, reading time and actionable checklists. Signed-in application rehearsal and study/certificate tools remain in the dashboard. [Knowledge Hub report](KNOWLEDGE-HUB-2026-10-12.md).
- Comparison charts are visible by default. Actual costs/admissions/enrollment keep currency, reporting year, population and measurement period separate. Cohort mismatch, invented missing values and the incorrect donut remainder were fixed; keyboard chart tabs, source tables, export/selection and reduced motion remain usable.
- Sign-in/register use a balanced two-panel layout, a genuinely credited campus photo, clearer labels and provider controls before email fields. Google/Apple/Telegram still show honest backend availability; visible controls do not mean owner credentials have been configured. Staff entry remains separate and hidden from public navigation.
- Landing retains centered search, the approved glass navbar, full PixelBlast and animated folders immediately after the hero. The university carousel remains manual and there is one scholarship section. A small original SVG application-path illustration, six exact country-guide links and an editorial article shelf add useful reading without invented dashboard statistics.
- A private support inbox is implemented and tested: public Contact us and a visible dashboard Report a problem control. Explicit consent, bounded plain text, no private profile/query tokens or automatic diagnostics, stable submission IDs, owner-change cancellation and protected staff review with conflict checking. Email is sender-provided/unverified; no automatic email is sent.
- Admin app access requires the DB admin role, verified TOTP factor bound to a live Supabase session, a recent verified code and an active server activity ledger. After **15 idle minutes**, local access closes, pending tools cancel, records/editors clear and this browser signs out locally. Background polling does not renew access. Only a new verified code can reopen an expired ledger. Own-profile access and authenticator enrollment remain reachable; existing direct catalogue RLS/RPC/logo-storage permissions retain their shared role helper.
- An allowlisted Database Structure preview displays column/relationship/policy metadata. It never exposes student rows, credentials, policy expressions or an arbitrary SQL executor.
- New code/tests were formatted, duplicate obsolete account CSS consolidated, native fetch binding fixed, and streamed request cancellation bounded. Default development binding is now IPv4 loopback to avoid intermittent localhost/IPv6 preview failures.
- Mobile navigation now has a visible close control, modal semantics, an inert/hidden background, bounded focus, Escape focus restoration and scroll locking. The compact Report a problem icon keeps its accessible name. Comparison categories are bookmarkable: the landing Costs link selects cost rows/tuition charts and changing category retains the comparison IDs, query context and hash.
- Ranking loading overlaps at most two pages with one 15-second deadline, retains capped-page and Leiden evidence, rejects incomplete/overflow scans and isolates caller cancellation from a shared public cache. The measured cold response improved **14.94 → 11.34 seconds**, with a **0.167-second** warm response. All **3,064 profiles** and their ranking/import evidence matched the earlier result. Database-side latency remains a future scoped optimization, not a claim of instant cold loading.
- Delayed renewal/expiry/warning callbacks now retain the initiating account generation, verification revision and session identity. A failed request from session A cannot close a newly verified replacement B or broadcast stale activity; genuinely current failures still close access. Four new asynchronous race tests cover these boundaries.

## Hosted activation: installed app protection, wider DB change held

The first admin-session proposal could not pass approval review because the account usage limit was reached. When ordinary usage became available, review separately rejected replacement of the **shared `private.is_admin()`** helper because of its broad RLS/RPC/service-job impact. Neither attempt applied that proposal, and no alternate SQL/credential route bypassed the rejection.

Root prepared and tested a **safer additive app-session migration**, preserving the existing shared role helper, catalogue RLS and service-job privileges. This distinct scope passed the protected hosted migration workflow. These migrations were installed and metadata/read-back verified:

1. `20261012153029_staff_app_session_lifecycle.sql` — verified TOTP/live-session ledger and four fixed lifecycle RPCs; existing role helper preserved.
2. `20261012153114_private_support_inbox.sql` — private support/report storage with bounded anonymous submission, immutable owner and exact retry/conflict checking; staff access independently requires an active authenticator ledger.
3. `20261012153147_staff_database_structure_preview.sql` — allowlisted metadata-only preview, independently requiring an active authenticator ledger.

The app's admin APIs now require the active verified session and the client clears records/editor work and signs out locally after 15 idle minutes. The **existing catalogue's direct Data API/RLS/RPC admin predicate remains role-based**. The owner answered **“Keep the current app protection”**, so `supabase/proposals/staff-global-enforcement-oct12.sql` remains **uninstalled by owner choice**. Do not apply the older full proposal after the additive lifecycle migration, because it would duplicate its table/functions.

New tables have RLS enabled and explicit minimal grants. The `private.staff_sessions` and existing `public.rate_limits` no-policy advisor notices are intentional: direct reads/writes are denied and bounded functions own their access. Existing public SECURITY DEFINER RPC warnings and leaked-password protection remain documented production review items; no new broad anonymous table privilege was introduced.

The earlier student-AI quota function **was installed** as migration `20261012015911` (`student_ai_owner_quota`). It enforces 12 requests/user/hour plus 50/app/day, but live AI remains disconnected at the owner's request. No API keys are configured. The supplied OpenRouter key-project ID alone is not project authentication; no account setting change is claimed.

Full audit history was retained. The separate compact audit proposal was not approved and was never applied. No old audit/source rows were removed.

## Data truth and gaps

Existing published coverage is **14,003 university identities / 212 countries**. Identities are not complete admissions profiles. Reviewed published programmes: **195**. Existing admissions statistics: **967**; requirements: **75**; costs: **4,553**; hosted official learning/application links: **19**. The 44,600 SFA observations cover 2,469 existing institutions and 19 metrics for the **2023–24 provisional** reporting period. The additional 59,829 dictionary-backed SFA candidates remain a private preparation/review artifact, not a new published dataset.

Existing QS/THE/ARWU values/history remain exact. Leiden is separate research indicators; 855 reviewed HERD/NIRF national/category positions are published. Restricted uniRank/CWUR/URAP/SCImago/U.S. News sources and the Webometrics identity/current-edition review are not invented imported ranks. A university missing from a publisher table is not assigned a fake position. The October 11 Lahore/Okara cache correction and five reviewed current programme additions remain preserved.

Two missing hosted **ranking-provider metadata rows** were inserted and read-back verified: CWUR and uniRank, both restricted; **zero editions, positions, university identities or images** were imported from them. uniRank's [official terms](https://www.unirank.org/terms/) require prior written permission for scraping/republication; CWUR's [official copyright notice](https://cwur.org/about.php) does not establish open redistribution permission. Exact permission evidence and retrieval date: `data/review/ranking-provider-metadata-oct12.json`; insert-only reproduction: `scripts/database/register-ranking-references-oct12.sql`.

**100 new Muse jobs were actually attempted**, ten concurrently with public names/official URLs only. **38 reports were emitted; zero processes exited successfully, and many remaining attempts hit service rate limits.** Those reports remain unverified source candidates, with **zero automatic publications**. Durable manifest: `data/review/muse-public-universities-oct12.json`; report copies: `outputs/muse-public-universities-oct12/`; exact execution ledger: `outputs/muse-public-100-oct12.json`. The earlier ten tasks 59–68 emitted reports with exit 1 as well. No private repository/account data or credentials were included in the new hundred prompts.

Remaining material gaps: actual provider OAuth/email-delivery journeys; hosted article publishing/version workflows; consented AI provider connection; comprehensive original/licensed learning banks; opt-in community/moderation; much broader current programme/applicant-specific facts, logos and permitted gallery assets. The supported SDK has a known delayed-logout/shared-session race; application owner/session guards and DB expiry protect staff access, but no unsupported SDK internals patch is claimed. Wider direct-catalogue session enforcement remains off by the owner's choice above.

## Verification and reproduction

**Full typecheck, lint (zero warnings), 568 Node tests, 217 Python tests and production build passed.** Browser receipts: 28 auth checks, 21 comparison checks, 14 Knowledge Hub checks, 15 support checks, 8 synthetic admin-session checks, 10 staff-structure checks, 28 landing-section checks, 4 country/reading checks and 7 final mobile/comparison checks; all report zero page errors. The full read-only HTTP smoke passed, including complete publisher final pages and anonymous denials. Five additional hosted-public-key checks verified private-inbox/session/structure denial without reading private rows or storing a message.

Ranking response/timing/evidence receipts are in `outputs/ranking-read-oct12/`. The measured latency values are single observations, not a statistical benchmark. Existing large optional bundle, framework route-classification and Node deprecation warnings remain; the build completes successfully. Security tests for global direct-API/Storage denial load the **uninstalled combined proposal**, while additive-migration tests prove the installed shared role/RLS helper and service privileges remain unchanged. Do not conflate those scopes.

Current full-check receipts are under `outputs/*-oct12.log` and browser JSON receipts. All private browser journeys used explicitly synthetic intercepted fixtures; no real signup/sign-in/reset or staff-message write was performed. Read-only live public MIT/Stanford comparison data was checked.

```sh
npm run typecheck
npm run lint
npm test
npm run test:data
npm run build
npm run dev
node tests/http-smoke.mjs
node outputs/verify-support-oct12.mjs
node outputs/verify-staff-session-oct12.mjs
node outputs/verify-auth-visual-oct12.mjs
node outputs/verify-landing-sections-oct12.mjs
node outputs/verify-landing-reading-oct12.mjs
node outputs/verify-ui-finish-oct12.mjs
node outputs/verify-admin-structure-oct12.mjs
# Prepare public Muse prompts only, with no external call or import
node scripts/run-public-muse-batch.mjs --limit 100
```

No repository push or application deployment occurred in this pass. The Obsidian vault at `/Users/likeanew/Downloads/CollegeStat` uses a checked 19-note synchronization with history retained and read-back SHA-256 verification. The exact final write receipt is `outputs/obsidian-sync-final-oct12-receipt.json`; preparation alone is not a completed vault update.
