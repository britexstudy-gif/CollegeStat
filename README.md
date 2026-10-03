# CollegeStat

Find universities, compare your options, and plan an application using sourced information.

React 19, TypeScript, Vinext/Vite, and Supabase/PostgreSQL. Public browsing uses the bundled catalogue by default. Accounts and private saved items use Supabase Auth and owner-only database policies.

## Run locally

Use Node.js 22.13 or newer:

```sh
npm ci
cp .env.example .env.local
npm run dev -- --hostname 127.0.0.1
```

Open [the local preview](http://127.0.0.1:5173). Environment files are ignored. Keep `NEXT_PUBLIC_CATALOGUE_SOURCE=bundled` until hosted tables and data have been installed and tested. A project URL and publishable key alone do not install the database.

## Product

- Search by university, country, subject, cost, and admission criteria. Sort rankings and rates in either direction; unknown values stay last.
- University profiles use a horizontal, keyboard-accessible section row: overview, how to apply, Programs, costs and funding, rankings, research and people, campus and students, gallery, and sources. Website, contact and sourced social accounts appear near the header. Older profile links still work.
- Search Programs by name, degree level, listing type and A–Z letter. Official listings and historical reported qualifications stay distinct; open intakes must be confirmed on the university website.
- Compare up to five universities with reorderable columns, category filters, differences-only and empty-row controls. Reporting years, populations and sources stay beside the figures and in CSV exports. Shared URLs preserve the selection.
- Discover university-linked scholarships and official funding programmes. Seven awards and ten scoped application dates are installed. Date-only sources never invent a cutoff time. Closed award cycles are hidden by default and clearly labeled when included.
- Use application checklists, a preparation timeline, and a funding budget in Resources.
- Save research and application plans after signing in. Support replaces the former Statistics navigation.
- The dashboard includes a weekly calendar that filters real tasks and application dates. Signed-in navigation shows Dashboard and the account avatar.
- Staff use a compact console with Coverage, Review, AI & MCP, and Security. Five scoped MCP tools inspect evidence or stage observations for review; no tool can publish records or run arbitrary SQL. See [staff tools and security](docs/ADMIN-MCP.md).

The catalogue contains **8,985 institutions across 175 countries**. The October identity reconciliation adds 648 active ROR Education identities and restores 1,146 ranking links. Installed publisher tables retain 1,504 QS 2027, 2,191 THE 2026, and 1,000 ARWU 2026 rows, including records not yet matched to profiles. Across installed editions, 4,813 ranking records link to profiles and 384 remain unmatched or ambiguous. Coverage varies substantially by field and institution. Published rank bands and ties remain unchanged; an institution without a publisher ranking is not assigned an invented position.

## Repository map

| Directory              | Responsibility                                                                   |
| ---------------------- | -------------------------------------------------------------------------------- |
| `app/`                 | Routes, metadata, API entry points, and styles                                   |
| `pages-ui/`            | Page views                                                                       |
| `components/college/`  | Shared product UI, account state, and source displays                            |
| `lib/`                 | Typed domain, search, profile navigation, and discovery rules                    |
| `server/`, `services/` | Public data assembly, verified sessions, private services, and bounded ingestion |
| `supabase/`            | PostgreSQL migrations, policies, and opt-in seeds                                |
| `data/published/`      | Reviewed public datasets with source evidence                                    |
| `scripts/ingestion/`   | Source fetchers and normalization; refreshes require review                      |
| `tests/`               | Domain, data, security, and local HTTP checks                                    |

Unused GPT-era mock pages, D1/SQLite examples, generator hosting metadata, and alternate installers have been removed. Active research assistance remains optional and server-side. Runtime state and generated TypeScript caches are ignored.

## Check changes

```sh
npm run typecheck
npm run lint
npm test
npm run build
node tests/http-smoke.mjs # requires the local server
node tests/staff-http-smoke.mjs # requires the ignored real review account
```

## Setup and data

Read [local setup](docs/LOCAL-SETUP.md), [operations](docs/OPERATIONS.md), [data sources](docs/DATASETS.md), [current data coverage](docs/CURRENT-DATA-2026-09.md), and [the October product pass](docs/PRODUCT-QUALITY-2026-10.md).

Apply migrations in filename order to a disposable development Supabase project first. `npm run supabase:bundle` creates reproducible SQL imports under ignored `data/exports/`. Use administrative access to apply them; never put service keys in browser configuration.

The bundle contains `01-schema.sql` (empty projects), `02-directory-identities.sql`, and `03-awards-and-dates.sql` (reviewed awards, dates and entry requirements). Schema installation needs Supabase administrative access. After installation, a server-only secret in ignored `.dev.vars` allows `npm run supabase:review-account` to provision a review account with `-- --create`. Its private credentials are written to ignored `outputs/review-account.json`, never browser configuration. A publishable key cannot create an administrator or install tables.

The reviewed full catalogue can be installed with `node --import tsx scripts/database/hosted-catalogue.ts --check`, then `--apply`. It uses the database-assigned review administrator's JWT, preserves existing rows, and validates child references before writing. `--from=media` resumes at a named table after fixing an interrupted import. Set `NEXT_PUBLIC_CATALOGUE_SOURCE=supabase` only after the import and `node --import tsx scripts/database/verify-hosted.ts` pass. This includes profile research, reported qualifications, application links and publisher ranking observations as well as relational evidence.

Sign-in is a separate page at `/auth/sign-in`. Staff enter through `/staff/college-console`; `/admin` returns 404. The route is only an entry point: server authentication, the database-assigned role and RLS enforce access.

Staff API writes now require authenticator verification in `/staff/college-console/security`. CLI `--apply` imports also require an enrolled authenticator and a current `COLLEGESTAT_MFA_CODE` supplied ephemerally; never save the code in a file or command argument. Local `--check` remains independent of account credentials. The broader database and logo-bucket MFA policy is validated locally but **not installed**: it awaits explicit owner approval in `supabase/proposals/admin-mfa-enforcement.sql`, outside automatic migrations. The installed coverage RPC is read-only; existing records and permissions are preserved.

Glass controls use a cached SVG displacement map on eligible Chromium desktops and CSS blur elsewhere. Maps are bounded, generated only on size changes, and paused offscreen; reduced motion/transparency, contrast and device constraints disable the enhancement. Phone and tablet layouts use lighter materials. See [the current quality report](docs/PRODUCT-QUALITY-2026-10.md) for verification and remaining coverage gaps.

Public ingestion preserves source links, dates, academic scope, and review status. Media needs attribution and permitted reuse. Scheduled refresh files produce reviewable artifacts; no automated approval or hosted publication is implied.

After rebuilding the directory, run `npm run ingest:rankings:link` with the retained source files and Python dependencies described in [the data pipeline](docs/LOCAL-DATA-PIPELINE.md). Reconciliation matches a unique registered name or alias within the same country and preserves campus qualifiers. Its [review journal](data/published/ranking-identity-reconciliation.json) makes restored links traceable. It uses the original cached snapshot date, not a new freshness claim.

On 3 October 2026 the connected hosted project passed schema installation, the full catalogue import, a real administrator login, private-note isolation, anonymous write denial, seeded comparison and admin API validation. Storage upload, OAuth/email delivery, account deletion, production hosting and scheduled feed activation remain separate integration checks. Read [the hosted checkpoint](docs/HOSTED-CHECKPOINT-2026-10-03.md) for exact coverage and limits.
