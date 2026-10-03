# CollegeStat local setup

This document describes a new checkout. The owner's connected hosted project was installed and checked on 3 October; see [the current checkpoint](HOSTED-CHECKPOINT-2026-10-03.md). Production hosting is a separate step.

## Run

```sh
npm ci
npm run dev -- --hostname 127.0.0.1
```

Open http://127.0.0.1:5173. Public research defaults to the bundled 8,985-institution catalogue. Account and admin actions require real authentication; there is no simulated session.

## Supabase

1. Create a Supabase project. Apply the SQL files in `supabase/migrations` in chronological order using the Supabase CLI or SQL editor. The application never creates tables from a browser.
2. Optionally apply `supabase/seed.sql` for six institutional identities then `supabase/seed-evidence.sql` for the separately cited MIT and Stanford facts, and `supabase/seed-intelligence.sql` for faculty, research, a licensed campus image, a program, language requirements, and a scholarship. Apply `supabase/seed-assets.sql` last for sourced university marks and the Stanford campus photograph. These are opt-in seeds, not automated production imports. No invented figures or coordinates are included.
3. Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the project URL and public key. The legacy `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` names are also accepted. Keep `NEXT_PUBLIC_CATALOGUE_SOURCE=bundled` until hosted tables and data are installed and tested.
4. Put server-only values in ignored `.dev.vars`: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (or `SUPABASE_SERVICE_ROLE_KEY`), `OPENAI_API_KEY`, `OPENAI_MODEL`. Never prefix these with `VITE_` or `NEXT_PUBLIC_`. Administrative access supports account deletion, connected-AI rate limiting, and the explicit review-account provisioning script; ordinary queries use the user's JWT and RLS. A server secret does not itself install SQL tables.
5. In Supabase Auth, configure the site URL and explicitly allow `http://127.0.0.1:5173/auth/callback` (and the intended application origin when deployment is separately authorized). Enable email/password and configure email confirmation/reset templates for the PKCE callback. Turn on `NEXT_PUBLIC_AUTH_EMAIL_ENABLED=true` after configuration.
6. Configure Google and Apple credentials in Supabase, including the Supabase provider callback URL. Enable the matching public feature flags only when configured. Apple web OAuth may not return a full name; the profile trigger preserves the initial name and users can edit it. Track Apple's web client-secret rotation separately.
7. Sign up normally. Bootstrap the first admin through a trusted Supabase SQL session: `update public.profiles set role='admin' where id='<authenticated-user-id>';`. Profile API permissions intentionally prevent users from changing their own role.
8. Restart the local server after changing environment files. Complete real OAuth, email confirmation, password reset, storage upload, and account deletion tests against a disposable development project.

Official references: [Supabase PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow), [Google](https://supabase.com/docs/guides/auth/social-login/auth-google), [Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access](https://supabase.com/docs/guides/storage/security/access-control).

## Architecture

- `components/college`: shared research UI, context, auth, navigation, command center, map, provenance and quick-view drawers.
- `pages-ui`: route-specific views. Route files are small adapters.
- `lib/domain.ts`, `lib/research.ts`: consistent typed domain, validated filters, null-aware calculations, currency and import validation.
- `lib/supabase`: repository queries, bounded 24-result Postgres explorer, detail hydration, typo-tolerant search RPC. The provider initially loads twelve featured identities; full paper/program libraries are omitted from discovery responses.
- `services`: typed workspace access, admin validation, server-only AI provider implementation.
- `server`: runtime configuration and token verification.
- `charts`: Recharts visualizations with textual equivalents. Trends only appear with sufficient records.
- `supabase`: migrations, opt-in identity seed, separately attributed evidence seed.
- Old generated monolithic pages, mock-auth API, unused landing experiments, SQLite/D1 examples, and generator-specific hosting scripts were removed. Supabase/PostgreSQL is the application database. The Vinext/Cloudflare runtime remains, with tool state under ignored `.wrangler/`.

## Security and data rules

Public statistics must be verified and sourced. Private saves, searches, comparisons, notes, lists, tasks, fit records, and history use owner-only RLS. An admin's catalogue permissions do not grant access to other users' private notes. Profile role updates are denied at the column-grant layer. Logo uploads are admin-only with a 5 MB size cap and PNG/JPEG/WebP MIME allowlist.

Imports preserve raw observations, validate values, flag conflicts and suspicious changes, and require review. Canonical changes generate audit rows. A conflict approval marks the earlier canonical data point as superseded; its observation and audit history remain. Ranking publication additionally requires provider and edition permission.

AI uses the configurable OpenAI Responses API on the server. It returns evidence IDs under a strict JSON schema; the response renderer resolves numbers and citations from server-owned records. No model-written numerical claims are rendered. Without keys, the explicitly labeled local provider selects evidence deterministically. Connected AI requires sign-in and a Postgres-backed 20-request/hour limit. Source text is treated as untrusted. Private profile fields and notes are not sent to OpenAI.

## Maps and data

MapLibre uses demonstration tiles locally, with a bundled worker. Configure `NEXT_PUBLIC_MAP_STYLE_URL` for production-quality licensed tiles. Seed coordinates are intentionally null until sourced. The map shows only coordinates actually stored in the catalogue; the table/list remains usable if tiles fail.

MIT tuition is for 2025–26, admissions for the Class of 2029, scholarship recipient percentage for 2024–25, and enrollment for October 2025. Stanford's enrollment total is explicitly labeled as a CollegeStat sum of the two published components. These are research examples, not a complete global dataset. The original citations and dates live in the records and source drawers.

## Validation

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

The security test executes the migrations in embedded PostgreSQL (PGlite), with minimal local `auth` and `storage` stand-ins. It checks RLS, role escalation, record isolation, constraints, review/audit behavior, ranking permissions, and bounded queries. This validates PostgreSQL behavior, not a hosted Supabase deployment or live OAuth provider.

## Known limits and next work

The core local research workflow is implemented. This is not a completed production launch. Live provider authentication, real storage, server secrets, real exchange rates, and permitted ranking/scholarship imports still need configuration and data.

The explorer currently covers country, region, city, field, degree, language, type, tuition, admission range, IELTS, international enrollment, aid reporting, and graduation. Distance, state/province, SAT/ACT ranges, outcome-specific filters, and richer saved-filter presets are follow-on work. Table columns can be chosen and resized; paginated views load 24 records.

Admin uses 25-row pages for records, sources, review, feeds, jobs, stale observations, and audit history. Durable refresh jobs, the Scorecard adapter, and an opt-in scheduler are implemented; see [operations](OPERATIONS.md) for configuration and live-validation requirements.

The workspace implements private notes, application status/deadlines, lists, checklist, recent views, searches, and comparisons. Notifications are schema-ready but no notification scheduler or email delivery is enabled. List assignment supports the picker and drop targets; advanced cross-list reordering is not implemented. Fit is calculated on demand; cached-score writes and richer personalized recommendations are not active. Scholarship matching must be expanded when authoritative eligibility records are imported.

The installed hosted catalogue and private account checks are recorded in the October 3 checkpoint. They do not establish that production hosting, OAuth/email delivery or every institution's data coverage is complete.
