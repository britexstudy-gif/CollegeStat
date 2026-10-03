# CollegeStat operations

## Architecture and data ownership

Public university identities live in `universities`. `admissions` stores cohort statistics; `costs` stores currency, period, student category, program scope, and reporting year. `data_points` stores versioned quantitative observations. `tuition`, `acceptance_stats`, `student_stats`, and `user_profiles` are security-invoker read models over those canonical tables; they preserve the caller's RLS.

Departments, professors, research groups, deadlines, requirements, aid, and media each retain source identity, exact URL, verification timestamp, and audit history. Program offerings have their own source and review state. A shared program vocabulary is not evidence that a university offers it. Faculty records do not include private contact data. Photos require source, creator, license, license URL, and explicit reuse permission. Institutional monograms remain typographic placeholders unless a permitted official logo is supplied.

Costs are never added across years, currencies, populations, periods, or programs. The profile breakdown does not label an incomplete set of components as total cost. Similarity reports shared characteristics, not personal admission probability. Preferences are explicit user choices. Missing preference dimensions are disclosed.

`source_records` preserves raw observations. Staging is transactional. A fingerprint makes identical observation retries idempotent; a corrected value stages a new observation. Approval serializes by institution/metric/year, supersedes the previous canonical record, inserts a new revision, and logs the reviewer. Old values remain available to administrators. Changes to published fields invalidate verification. Public ranking records require both verification and provider/edition reuse permission.

## Apply and upgrade

1. Use a disposable Supabase project first; take a backup before any existing production migration.
2. Apply migrations in filename order. Existing projects should inspect duplicate observation fingerprints and multiple canonical facts for one institution/metric/year before applying migration 003. Its unique constraints intentionally reject unresolved duplicates instead of silently deleting history.
3. Apply optional seed files in the order documented in README. Seeds use stable IDs and do not overwrite existing records.
4. Set browser public keys and server-only credentials as described in LOCAL-SETUP. Restart the development server after configuration changes.
5. Run the checks, then verify two-user isolation, OAuth callbacks, sign-out, recovery, storage, account deletion, and admin review against hosted Supabase. Embedded PostgreSQL tests do not replace those hosted tests.

## Trusted ingestion and refresh

`npm run ingest:run` is a bounded Node worker. It enqueues due enabled feeds, processes up to ten jobs, and exits. `ingestion_feeds` stores the schedule, adapter, source, and endpoint. Administrators can create feeds and identity mappings in the workspace; feeds default to disabled. A scheduler calls the worker periodically. `.github/workflows/refresh-data.yml` is opt-in through the repository variable `INGEST_ENABLED=true`; it is not active merely because the file exists locally.

Set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and an exact comma-separated `INGEST_ALLOWED_HOSTS` list in the worker's secret environment. The optional Scorecard adapter also needs `SCORECARD_API_KEY`. Never use a browser-prefixed environment name. The worker rejects redirects, credentials in URLs, non-HTTPS endpoints, unexpected ports, non-allowlisted domains, and nonpublic DNS addresses. DNS is pinned to a checked IPv4 address for the TLS request. Responses have a 20-second total deadline and a 2 MB limit. Error logs contain codes and job IDs, never source bodies, keys, or URLs containing keys.

Adapters:

- `collegestat-json`: an approved source's normalized JSON array with `university_id`, `metric`, `year`, `value`, `unit`, `source_url`, and optional `notes`. Batches are limited to 500. Invalid values reject the entire transaction; unknown data should be omitted, never zero-filled.
- `scorecard`: `https://api.data.gov/ed/collegescorecard/v1/schools?id=166683&year=2024`, for example. This is a configuration example, not an enabled feed or an imported observation. Set the institution's `ipeds` identifier first. The adapter replaces its fields and API key itself, requires an explicit reporting year, maps admission/enrollment/completion fields, and retains their official field definitions. It refuses unmapped institutions and truncated responses. Split larger lists into feeds of at most 100 institution IDs. Tuition is deliberately not mapped to international tuition: Scorecard residency categories are not equivalent.

Jobs use database leases and `FOR UPDATE SKIP LOCKED`. Abandoned leases can be reclaimed. A stale worker cannot stage results using an expired token. Failures back off exponentially and stop after five attempts. Admins can retry failed jobs. Completed ingestion becomes `review`; it never auto-publishes. The Stale screen lists canonical quantitative evidence last verified more than a year ago or awaiting review. Deadline-specific refresh intervals should be shorter than annual statistical intervals.

Keep the worker key in the scheduler's encrypted secrets store, restrict who can edit workflows, rotate it, and monitor failed jobs. The worker currently uses Supabase's broad service role; a separately provisioned restricted database worker role is a future hardening option. No worker or scheduler was activated during this local implementation.

## Authentication, security, and privacy

Google/Apple use Supabase OAuth with PKCE. Configure each provider and exact callback allowlist in Supabase before enabling its UI flag. Rotate Apple's client secret. Email verification and recovery must be configured and tested. Users cannot change their own role. Admin privileges apply to catalogue operations, not other users' private notes and saves.

Owner-only RLS protects account records, and server routes verify bearer tokens. Administrative routes have a database-backed fixed rate budget. Direct import RPCs also enforce per-user limits. Connected AI uses the existing service-backed per-user budget and fails closed if it cannot be checked. The unconfigured local research fallback has process-local throttling; configure an edge/IP limit before publicly exposing it at scale. Supabase Auth rate limits must be configured in the hosted project.

HTTPS is required for configured Supabase and source URLs. Production responses set HSTS on HTTPS, prevent framing, and disable object embedding. Private routes use no-store. Supabase provides managed storage encryption; RLS is authorization, not application-level encryption. Do not collect passports, medical information, bank details, or other sensitive documents in notes. If such a feature is introduced, add an explicit encrypted storage design with envelope keys kept in a server KMS, retention/deletion rules, and recovery procedures before collecting that data. Browser-stored sessions require normal XSS defenses; the application uses escaped React content and never renders imported HTML.

Connected AI extracts constrained JSON filters first, validates them, queries public RLS records, then selects evidence IDs. Displayed numeric evidence is resolved from server records, not model prose. Private profiles and notes are not included. Unsupported query text is shown as unapplied. Models are configured through `OPENAI_MODEL`, not hard-coded. Verify output/refusal behavior and cost limits with the model you configure.

## Evidence and assets

MIT faculty and research: [CSAIL faculty](https://www.csail.mit.edu/person/daniela-rus), [EECS directory](https://www.eecs.mit.edu/people/daniela-rus/), [Distributed Robotics Laboratory](https://www.csail.mit.edu/research/distributed-robotics-laboratory). Program: [MIT Course 6-3](https://catalog.mit.edu/degree-charts/computer-science-engineering-course-6-3/). Aid: [MIT Scholarships and grants](https://sfs.mit.edu/undergraduate-students/types-of-aid/mit-scholarships-grants/). Requirements: [MIT tests and scores](https://mitadmissions.org/apply/firstyear/tests-scores/). Retrieved September 23, 2026. Scores are requirements under the source's stated conditions, not predictions; TOEFL changed scales in 2026, so labels retain the test-date distinction. Reference degree language is left unknown because the degree-chart source alone does not specify it.

Campus image: [MIT Killian Court](https://commons.wikimedia.org/wiki/File:MIT_Killian_Court.jpg), Madcoverboy, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). The UI links creator/source/license and notes the display crop. The original photograph is from 2008, not a current campus view. It is loaded from a sized Wikimedia derivative and has a failure state.

Implementation references: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions), [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs), [College Scorecard API](https://collegescorecard.ed.gov/data/api/).

## Remaining activation work

Live Supabase, provider OAuth, AI calls, and remote ingestion were not exercised without credentials. The reference catalogue is not broad enough for global recommendations; rankings and deadlines require separately sourced and reviewed imports. Program and scholarship coverage is intentionally limited. The related-university panel ranks a bounded same-country candidate page rather than claiming a global similarity index. Configure licensed map tiles, scheduler secrets, monitoring/alerts, backups/PITR, and restore drills before launch. The production build also currently reports a large client bundle warning from the mapping/chart dependencies.
