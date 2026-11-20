> **Activation update, 12 October 2026:** the metadata-only structure preview is installed as `20261012153147_staff_database_structure_preview`, requiring the separately installed active TOTP app-session ledger. The shared catalogue admin helper was preserved. The newer Knowledge Hub report supersedes public-resource descriptions below.

> **Final verification:** the ten structure browser checks were rerun with the installed app-session gate represented by explicit synthetic authenticated fixtures; all passed with zero page errors and no hosted private writes. The owner chose to keep the current app protection, leaving the broader shared-helper proposal uninstalled. “Proposal/uninstalled” instructions in the original scoped report below are historical; use the current checkpoint for the installed migration ledger.

# Articles, focused Resources and staff structure — 12 October 2026

Later public-reading update: [Knowledge Hub implementation](KNOWLEDGE-HUB-2026-10-12.md) supersedes the six-article/public Resources description below. The original receipts remain as historical evidence; the staff structure work is independent.

This records the scoped implementation and verification of these features. It does not assert a complete project rerun, deployment, new dataset publication or configured live student AI. The [11 October checkpoint](DEVELOPMENT-CHECKPOINT-2026-10-11.md) remains the dated data/publication record; root owns final reconciliation and Obsidian.

## Reading has its own destination

- Public `/articles` and private-workspace `/dashboard/library/articles` provide searchable topic categories: University research, Applications, Costs & funding, Writing, Tests & language, and Study destinations.
- **Six existing original CollegeStat guides** have reading pages at `/articles/:id` and `/dashboard/library/articles/:id`, reusing their actual content, local editorial artwork, checklists and official source links. Existing `/resources/:id` and dashboard resource-guide URLs still work.
- **Eleven existing official destination references** are a separate link-only reading list. They retain publisher, applicant population and original checked date, and open the source website. They are not eleven newly written articles or newly imported facts. No protected source-page content or question bank was copied.
- Categories, search, live counts, empty-state recovery, visible focus and direct topic links work. Filter controls stay disabled until hydration so an early click cannot be silently lost; ordinary article/source links remain native links.
- Shared Library navigation has an Articles entry through the separate Certificates/navigation agent's integration; this pass did not edit the shared provider, authentication or shell.

`/resources` now ends after the selected Qualifications by destination, Application rehearsal or Optional study resources panel. It no longer appends the handbook, all current-guidance cards, task-card row or unrelated follow-on section. A single header link opens Articles. Existing tab URLs, university/hash context, back navigation and account-scoped rehearsal/checklist behavior are preserved.

## Read-only staff database structure

Database structure is one secondary tool under **Operations**, preserving Overview/Catalogue/Review/Operations and all existing entities/URL aliases. Its inspector shows columns, primary keys, nullable/default-presence flags, foreign-key relationships and policy names/commands/roles. Table/column search and mobile selection work. Policy metadata is explicitly described as a summary, not a security audit; view caller/owner behavior is distinguished from table RLS.

`POST /api/staff/structure` uses the existing database-backed administrator check, verified `aal2` and administrative request budget. It uses the caller's authenticated client, never a service-role key. A whole 15-second deadline covers authorization, bounded request-body reading and RPC; stalled body readers are cancelled. The strict metadata contract rejects extra row/SQL/default/policy-expression fields and payloads beyond 256 KiB. Unavailable or invalid data gives a safe 503 and retry; earlier checked metadata remains labelled during a failed refresh.

The exact reviewed SQL is [staff-database-structure.sql](../supabase/proposals/staff-database-structure.sql): a private `SECURITY DEFINER` helper and public `SECURITY INVOKER` wrapper, empty search paths, fixed **62-name application-relation allowlist**, explicit function grants/revokes, and independent fresh profile-role plus MFA checks even for direct RPC. It returns metadata only. Existing tables, rows, policies, table privileges and historical facts are unchanged. The helper does not expose default expressions, policy expressions, record values, SQL execution or credentials. Private workspace column names are schema metadata, not permission to read student records.

**Hosted activation remains pending root review/apply at this report's creation.** There is no claim that a prepared SQL proposal is installed. The Supabase CLI was unavailable in the inspected paths, so no fabricated CLI migration filename was created; root will reconcile the actual hosted migration ledger after review. Existing broader direct-API MFA gaps are not solved by this one metadata endpoint.

## Actual verification

- **14 public Articles/Resources browser checks, zero page errors:** all six topic memberships, actual image decoding, source metadata/HTTPS links, search recovery/focus, keyboard reader navigation, legacy guide URLs, selected-resource isolation, rehearsal/back context, direct category/404 behavior, and 1440/1000/768/390/330px light/dark layouts.
- **11 Node/PostgreSQL tests, zero failures:** actual proposed SQL in PGlite denies anonymous/service-role execution, student role spoofing and missing MFA; excludes fixture row/default/policy secrets, preserves table data/policies/privileges, supports ordered composite foreign keys and view metadata, and immediately denies a role downgrade. Handler tests verify bounds, denied/rate statuses, safe 503s and stalled authorization/RPC/body cancellation.
- **10 staff browser checks, zero page errors:** actual local anonymous/cross-origin denial; synthetic authenticated metadata/session fixtures for retry, four-area navigation, keyboard policy tabs, relationship navigation, table search, invalid-response rejection and 1440/1050/900/768/390/330px light/dark layouts. No hosted accounts or private data were written. This is not a real hosted MFA-session end-to-end success.
- Scoped ESLint and repository typecheck passed with zero warnings. Root's final aggregate tests/build are separate; these scoped counts must not be presented as the final project total.

Browser receipts and captures are in `outputs/articles-browser-oct12.json`, `admin-structure-browser-oct12.json` and their image/verification-script companions. Reproduce the SQL/handler tests with `node --import tsx --test tests/admin-structure.test.ts`. Root must review the proposal before hosted application; fresh metadata can then be checked through a real verified staff session without reading private rows.
