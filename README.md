# CollegeStat

Find universities, compare your options, and plan an application using sourced information.

React 19, TypeScript, Vinext/Vite, and Supabase/PostgreSQL. Public browsing uses the bundled catalogue by default. Accounts and private saved items use Supabase Auth and owner-only database policies.

The [10 October checkpoint](docs/archive/DEVELOPMENT-CHECKPOINT-2026-10-10.md) records the latest UI, actual hosted publications, verification and remaining gaps. Older dated reports remain history. The [Muse Spark 1.3 xhigh prompt pack](docs/archive/MUSE-SPARK-1.3-XHIGH-PROMPTS.md) and [OpenCode guide](docs/archive/OPENCODE-MUSE-1.3.md) include thirty scoped prompts; tasks 23–25 extend the earlier runs with official admissions, graduation-cohort review and current degrees, task 26 audits preview loading, and tasks 27–30 research publisher reuse, student workflow, official profile sources and staff MCP. Twenty-three actual run attempts/reports are recorded; report output and zero exit status are distinguished. A separate [dashboard design concept](design-reviews/dashboard-oct09/research.md) remains a review proposal at http://localhost:5175/ while its local server runs. The working app is at http://localhost:5173/.

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
- Compare up to five universities with reorderable columns, category filters, differences-only and empty-row controls. Five actual-data views include bars, columns, publisher positions and coherent reported cost donuts. Reporting years, populations, currencies and sources stay beside the figures and in CSV exports. Shared URLs preserve the selection; unknown values are not zero.
- Discover university-linked scholarships and official funding programmes. Seven awards and twenty scoped application dates are installed. Date-only sources never invent a cutoff time. Closed award cycles are hidden by default and clearly labeled when included.
- Use 19 hosted official study/destination links, source-linked qualification guidance, an editable application rehearsal, a preparation timeline and a funding budget in Resources. Explicit checklist saves use the current user's private account and reject stale account-switch responses.
- Save research and application plans after signing in. Support replaces the former Statistics navigation.
- The student dashboard has four primary areas: Home, Universities, Library and Prepare. Explorer, rankings, comparison, university profiles, official resources and private settings remain inside its persistent shell. Existing section URLs still work; queries, profile tabs, comparison IDs and unsaved writing survive nested navigation. My plan remains inside Prepare.
- Practice original SAT-style math/reading and IELTS-style reading mini exercises with explanations and results. These are independent exercises, not official tests or score predictions. The writing desk has personal-statement, motivation-letter and recommendation-request guides, a checklist and text download. Explicit Save version now stores immutable owner-private history with safe retry, restore, removal and account-data export; unsaved edits stay local. Examples are not AI-generated or claimed to be accepted letters.
- Private student settings include study priorities, country search, budget, fit weights and existing export/account controls. Staff overview preserves available metrics when an optional query fails; registered accounts and recorded database changes remain distinct from unconnected active-user telemetry.
- Light mode is the default with an explicit theme button. The restored floating glass navbar and full-width interactive PixelBlast frame a centered headline/search, without the rejected hero image section. Native hero submission preserves interpreted filters before hydration. Scroll text and the particle footer animate when visible, with reduced-motion fallbacks. One scholarship section shows actual attributed campus photographs. A useful official destination guide replaces the rejected dashboard/question preview; sign-in/register use an attributed Toronto photograph and honest social-provider setup states.
- Staff use four primary areas: Overview, Catalogue, Review and Operations, with existing datasets, coverage, accounts, sources, imports, security and MCP available as secondary views. Five scoped MCP tools inspect evidence or stage observations for review; no tool can publish records or run arbitrary SQL. See [staff tools and security](docs/ADMIN-MCP.md).

The **bundled and hosted** catalogues now contain **14,003 published institution identities across 212 countries**. The 9 October insert-only sync added 5,003 reviewed ROR identities and preserved the complete content checksum of all original 9,000 hosted rows. These are sourced identities, not fully documented admissions profiles. Installed publisher tables retain 1,504 QS 2027, 2,191 THE 2026, and 1,000 ARWU 2026 rows, including records not yet matched to profiles. Across installed world editions, 4,820 records link to profiles and 377 remain unmatched or ambiguous. The earlier hosted regional checkpoint has 85 sourced positions across five editions; the bundled fallback has 27 across Asia and Europe. Published rank bands and ties remain unchanged.

The national ranking source selection contains 925 HERD FY2024 positions and 114 selected NIRF 2025 category positions with original source/permission evidence. On 10 October, **796 HERD and 59 NIRF entries became verified public facts across 829 distinct profiles and 14 enabled editions**. The remaining **184 source records** are pending; five previously linked ambiguous/current-source-missing entries stay held and four empty editions stay disabled. Together with existing QS/THE/ARWU and 7,158 Leiden indicators, the product has six data-backed systems with different scopes, not six equivalent world rankings. See [the publication receipt](data/published/national-publication-oct10.json) and [current checkpoint](docs/archive/DEVELOPMENT-CHECKPOINT-2026-10-10.md); the [9 October import report](docs/archive/RANKING-IMPORTS-2026-10-09.md) remains history. External provider links are not installed observations.

The [October 5–6 data history](docs/archive/DATA-DEEPENING-OCT05.md) records 79 requirements, 20 application deadlines, 190 hosted programmes and 8,277 research metrics. On October 9, **44,600 reviewed IPEDS financial-aid observations across 2,469 universities / 19 metrics became verified, canonical and anonymously readable**, with exact cached source/dictionary/value parity and no overwrites. They describe the **2023–2024 academic year**, not current award guarantees or international eligibility. The same pass published **19 versioned official resource links, with zero copied exam questions**, through an additive `learning_resources` migration reusing existing sources/RLS/auditing. Missing requirements and unknown ownership remain visible coverage gaps; retrieval does not replace reporting year.

On 10 October, five official Waterloo/WIUT deadline/tuition candidates were staged privately with population and cycle evidence; generic numeric approval is blocked for structured sections. Six further current-degree candidates remain review-only with unknown years/language preserved. IPEDS graduation cohorts remain held, not fabricated. [The current checkpoint](docs/archive/DEVELOPMENT-CHECKPOINT-2026-10-10.md) gives exact public/private counts, additive migrations, reproduction commands and remaining workflow gaps.

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
python3 -m unittest discover -s tests -p 'test_*.py'
python3 scripts/ingestion/audit-data-quality.py --as-of 2026-10-06 --out outputs/quality-report-oct05.json
```

## Setup and data

Read [local setup](docs/LOCAL-SETUP.md), [operations](docs/OPERATIONS.md), [data sources](docs/DATASETS.md), [the current checkpoint](docs/archive/DEVELOPMENT-CHECKPOINT-2026-10-10.md), [performance and migrations](docs/archive/PERFORMANCE-2026-10-09.md), and [the October 5–6 data history](docs/archive/DATA-DEEPENING-OCT05.md).

Apply migrations in filename order to a disposable development Supabase project first. `npm run supabase:bundle` creates reproducible SQL imports under ignored `data/exports/`. Use administrative access to apply them; never put service keys in browser configuration.

The bundle contains `01-schema.sql` (empty projects), `02-directory-identities.sql`, and `03-awards-and-dates.sql` (reviewed awards, dates and entry requirements). Schema installation needs Supabase administrative access. After installation, a server-only secret in ignored `.dev.vars` allows `npm run supabase:review-account` to provision a review account with `-- --create`. Its private credentials are written to ignored `outputs/review-account.json`, never browser configuration. A publishable key cannot create an administrator or install tables.

The reviewed full catalogue can be installed with `node --import tsx scripts/database/hosted-catalogue.ts --check`, then `--apply`. It uses the database-assigned review administrator's JWT, preserves existing rows, and validates child references before writing. `--from=media` resumes at a named table after fixing an interrupted import. Set `NEXT_PUBLIC_CATALOGUE_SOURCE=supabase` only after the import and `node --import tsx scripts/database/verify-hosted.ts` pass. This includes profile research, reported qualifications, application links and publisher ranking observations as well as relational evidence.

Sign-in is a separate page at `/auth/sign-in`. Staff enter through `/staff/college-console`; `/admin` returns 404. The route is only an entry point: server authentication, the database-assigned role and RLS enforce access.

Staff API writes now require authenticator verification in `/staff/college-console/security`. CLI `--apply` imports also require an enrolled authenticator and a current `COLLEGESTAT_MFA_CODE` supplied ephemerally; never save the code in a file or command argument. Local `--check` remains independent of account credentials. The broader database and logo-bucket MFA policy is validated locally but **not installed**: it awaits explicit owner approval in `supabase/proposals/admin-mfa-enforcement.sql`, outside automatic migrations. The installed coverage RPC is read-only; existing records and permissions are preserved.

Glass controls use a cached SVG displacement map on eligible Chromium desktops and CSS blur elsewhere. Maps are bounded, generated only on size changes, and paused offscreen; reduced motion/transparency, contrast and device constraints disable the enhancement. Phone and tablet layouts use lighter materials. See [the current quality report](docs/archive/PRODUCT-QUALITY-2026-10.md) for verification and remaining coverage gaps.

Public ingestion preserves source links, dates, academic scope, and review status. Media needs attribution and permitted reuse. Scheduled refresh files produce reviewable artifacts; no automated approval or hosted publication is implied.

After rebuilding the directory, run `npm run ingest:rankings:link` with the retained source files and Python dependencies described in [the data pipeline](docs/LOCAL-DATA-PIPELINE.md). Reconciliation matches a unique registered name or alias within the same country and preserves campus qualifiers. Its [review journal](data/published/ranking-identity-reconciliation.json) makes restored links traceable. It uses the original cached snapshot date, not a new freshness claim.

On 3 October 2026 the connected hosted project passed schema installation, the full catalogue import, a real administrator login, private-note isolation, anonymous write denial, seeded comparison and admin API validation. Storage upload, OAuth/email delivery, account deletion, production hosting and scheduled feed activation remain separate integration checks. Read [the hosted checkpoint](docs/archive/HOSTED-CHECKPOINT-2026-10-03.md) for exact coverage and limits.
