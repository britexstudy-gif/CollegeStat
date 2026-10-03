# CollegeStat staff tools

Open `/staff/college-console/mcp` with a database administrator account. The smaller console provides Overview, Coverage, Universities, Review, AI & MCP, and Security. Other datasets remain under expandable groups.

## MCP endpoint

`POST /api/staff/mcp` implements a stateless JSON Streamable HTTP transport using protocol `2025-06-18`. GET is authenticated and returns 405 because this server does not offer unsolicited SSE. No persistent session ID is required.

Headers:

```text
Authorization: Bearer <current Supabase staff access token>
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2025-06-18
```

Initialize, send the initialized notification, then discover tools with `tools/list`. Call with JSON-RPC `tools/call`. Each request verifies the user with Supabase Auth, checks the current role in `profiles`, and consumes the existing administrative rate budget. The workbench uses the same endpoint and tools as an external MCP client.

| Tool | Scope |
| --- | --- |
| `search_universities` | Identity records; name search, at most 25 results |
| `university_coverage` | Verified structured categories, requirement sources, pending/conflicting counts for one UUID |
| `list_sources` | Registered source names, organizations, original URLs |
| `review_queue` | Pending or conflicting numeric evidence, at most 25 observations |
| `stage_observations` | At most 25 sourced observations into the existing review queue; requires MFA |

There is no arbitrary SQL tool, user-data tool, approval tool, remote-URL fetching tool, or service-role delegation. Unknown arguments and unbounded limits are rejected. Tool results contain both text and structured data. Source notes are untrusted data, never agent instructions. Publication remains an explicit staff action in Review.

External clients must support bearer headers. This endpoint does not implement OAuth discovery or long-lived integration credentials; a current staff token expires and must be refreshed by the authenticated client. Do not paste access tokens into chat, commit them, store them in Obsidian, or substitute the service-role key. The endpoint copy action copies only its URL.

## Optional AI routing

`/api/staff/assistant` accepts a staff question and optional selected university UUID. With server-only `OPENAI_API_KEY` and `OPENAI_MODEL`, the model chooses a **read tool** and search text using a constrained JSON schema. It does not receive a write tool or invent response facts. Response storage is disabled. Results are rendered from the database. Without those variables, direct catalogue tools remain functional and the UI identifies catalogue mode rather than claiming AI is enabled.

## Security and encryption

Security provides TOTP enrollment and session verification through Supabase Auth. API writes require verified JWT `aal2`. Existing database RLS policies remain in force; students can still update their own private workspace without staff MFA. The additional database statement trigger and restrictive logo-bucket MFA policies are a **pending proposal**, not installed on hosted Supabase. Automatic approval review rejected that broader production change because of its potential to interrupt current workflows. The exact proposal is `supabase/proposals/admin-mfa-enforcement.sql`; local PostgreSQL tests verify its direct-write and review/import protections. Installing it requires explicit owner approval. It is intentionally outside automatic migrations. Existing source-record audit triggers record staging and later publication. Automated service-role ingestion retains its existing job-lease restrictions.

The managed database already has encryption at rest, and HTTPS uses TLS, as documented by [Supabase](https://supabase.com/security). This change adds authorization and MFA; it does not claim to add end-to-end encryption. Private notes remain plaintext to authorized database operators. Encryption keys and provider secrets are not stored in application tables or sent to the browser.

An admin must enroll and verify their authenticator before editing through the staff API. Direct authenticated database operations currently retain the pre-existing role and RLS rules until the database proposal is approved. Read tools and the Security page remain available before enrollment. Losing all enrolled factors requires the existing Supabase account recovery procedure; do not disable the database guard as an application workaround.

## Evidence limits

Coverage counts only verified structured records, not every imported profile-library field. Category presence is not programme completeness, requirements eligibility, ranking comparability, or current-cycle applicability. The inspector retains applicant scope, reporting year, required/optional status, and original source links. Historical source checks remain distinguishable.

## Verification

`npm test` checks protocol dispatch, input bounds, side-effect-free notifications, PostgreSQL ownership/RLS, role escalation, direct/RPC MFA denial, and date-only planner boundaries. `node tests/staff-http-smoke.mjs` uses the ignored local review account for real login, initialization, discovery, all four read tools, coverage, assistant routing, and rejection of unauthenticated, cross-origin, and non-MFA writes. It creates no records or accounts. Run the usual HTTP smoke, typecheck, lint and build as well.

Implementation follows the [MCP transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports), [MCP tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools), and [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa) documentation.
