# Staff MCP and account workspace checkpoint

3 October 2026. The existing private CollegeStat repository and production catalogue were extended, not replaced.

## Shipped in this pass

- Signed-in navigation: Dashboard button plus real avatar, with initials if no usable image exists. Session restoration does not flash the anonymous sign-in control.
- Sign-in: wider, shorter layout; full approved blue collage; one clear form; create-account link; provider buttons appear only when the backend reports them enabled. Email, recovery and safe return destinations are retained.
- Student dashboard: Monday-based weekly planner, week navigation, task/date filtering, progress and saved application context. Dates are calendar dates and local today, with no invented application dates or test scores. Owner-only persistence remains intact.
- Admin: six primary destinations, secondary datasets in expandable groups, live coverage inspection, requirement scope and original-source links.
- MCP: stateless authenticated HTTP endpoint, real initialization, five discovered tools, typed input limits, notification safety, source search and staging into the existing review queue. The assistant routes read requests and returns database results; optional AI routing needs server credentials.
- Security: real TOTP setup and session verification; staff API writes require verified `aal2`. CLI catalogue imports can complete the same step-up before writing. No credentials or codes are committed or put in the vault.

## Hosted database

Only `admin_mcp_coverage` was applied: a new staff-only, security-invoker coverage function. Anonymous execute privilege is false. Post-change counts remain **8,985 universities, 31 structured requirements, zero existing private notes**. No stored records were replaced or deleted.

The broader MFA enforcement proposal is **pending**, outside automatic migrations. Automatic approval review rejected installing write triggers across the existing catalogue tables and restrictive logo-bucket policies because they could interrupt administrator or ingestion workflows. The reviewed SQL is `supabase/proposals/admin-mfa-enforcement.sql`. Local PostgreSQL tests verify direct-write and import-RPC denial for password-only sessions, successful verified-admin work, and unaffected private student records. Owner approval is required before installation; existing hosted RLS remains unchanged.

## Verification and practical limits

The local suite passes 83 tests, including MCP dispatch/input safety, calendar boundaries and database ownership/security. Typecheck, lint, production build and the public HTTP smoke pass. A real administrator login also passes MCP initialization, discovery, the four read tools, coverage and assistant routing; non-MFA writes, anonymous requests and cross-origin requests are denied. No live staging/publication was performed. The full TOTP enrollment flow awaits the owner's authenticator; it was not enrolled on their behalf.

The production build retains the existing optional-map large-chunk warning and Vinext route-classification notice. No computer use was performed. Visual acceptance remains owner review, particularly sign-in proportions, tablet controls and dashboard density. Existing logo/gallery/program/requirements coverage gaps remain open; MCP coverage surfaces verified structured gaps rather than claiming every institution is complete.

Supabase advisors report the existing guarded security-definer functions, a deny-all RLS table, disabled leaked-password protection, and unused indexes. The new coverage function introduces no corresponding security-definer exposure. Review [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [security-definer exposure](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), and [deny-all RLS](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) before asserting a complete security audit. These notices are not treated as permission to remove policies or delete indexes.

See [MCP details](ADMIN-MCP.md) for protocol, authentication, encryption boundaries and external-client limitations. Managed Supabase encryption at rest is existing provider protection, not a new end-to-end encryption feature.
