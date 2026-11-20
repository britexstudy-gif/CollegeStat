# Product quality pass — 2 October 2026

Update, 6 October: [source coverage and hosted checks](DATA-DEEPENING-OCT05.md) now include 79 requirements, 20 deadlines and 8,277 research metrics; 44,600 aid observations remain private pending review. Earlier UI and data results below keep their original dates.

This is the October 2 record. Hosted installation, administrator testing, dedicated sign-in and the illustrated 404 are now covered in [the October 3 checkpoint](HOSTED-CHECKPOINT-2026-10-03.md); its results supersede the earlier hosted-access gaps below.

The interface should help a student answer four questions: where can I study, how do I apply, what will it cost, and what evidence supports the answer?

## Changes

The homepage has a direct search field and a visible scholarship/funding section. Main page titles and actions use familiar terms. The earlier navbar is preserved, with Support in place of Statistics and no rotating logo.

University navigation now groups related information into nine horizontal tabs, including Gallery. The rejected “View section” dropdown and large surrounding glass panel are removed. Tabs have keyboard navigation, familiar icons and a small glass selection pill. Application routes, requirements and dates appear together; fees and linked scholarships appear together; student information lives alongside campus guidance. Legacy section links resolve to their new section. The shared model lives in `lib/profile-navigation.ts`. Sourced website/contact/social buttons appear beside the header area, using real platform marks and safe, deduplicated account URLs.

The Programs section replaces the Courses label. It combines official listings and historical reported qualifications in a searchable, degree-filtered A–Z list with pagination. Listing type, dates and source links remain visible. Past completions do not establish a current intake; a named program opens its official page when one is known. Subject-ranking routes and selected sourced regional positions improve discovery without manufacturing rankings.

Nine institution-specific application summaries are now connected to profiles, including four added from official sources on 1 October (Toronto, Ruse, WIUT and ETH). Degree-specific planning checks cover profiles without detailed current requirements. Ruse/WIUT past-cycle deadlines are explicitly marked closed. Correcting the canonical website lookup also restores MIT's existing application summary and Fall 2025 admissions snapshot.

Common App lettering is dark on the white application card; UCAS uses its full official wordmark. Eleven university marks were obtained from official websites with source/hash records and suitable light/dark surfaces. The October 2 additions are Cambridge, Toronto, HKU and NTU. Licensed photographs for Harvard, Cambridge and HKU bring sourced campus-photo coverage to 498 profiles; galleries retain creator, license and original-image links. The shared logo component does not use an OpenAlex campus photo as a logo. Many university marks remain missing; a website icon or initials is labeled accordingly.

The owner's confirmed blue collage of the student, buildings and plane remains. Its silent loop plays a short introduction and stops; reduced-motion and background/offscreen handling remain, while the visible pause control and floating “Your next chapter” label are removed. The broad filter, result-toolbar and profile-tab glass surrounds are gone. Compact navigation and search controls use a transparent rim, restrained highlights, blur and a rounded lens displacement field on eligible Chromium desktops. Other browsers use CSS material. SVG maps are cached, bounded to 180,000 pixels and generated after debounced size changes; there is no continuous animation or scroll handler. Device, reduced-motion/transparency and contrast preferences disable enhancement. This follows the progressive approach in [Kube's liquid-glass article](https://kube.io/blog/liquid-glass-css-svg/), without promising cross-browser SVG backdrop support.

Phone and tablet layouts hide the squeezed sidebar, use a scrollable filter sheet, keep controls at least 44 pixels tall, respect safe-area space and contain comparison-table scrolling. The requirements layout now has separate description, numeric value and source areas; source buttons cannot consume the row width. Small screens stack them when needed. Eight new reviewed requirements cover Toronto, Cambridge and Oxford, with visible policy notes and direct source links. Alternative English qualifications, conditional offer requirements, exemptions, and the January 2026 TOEFL scale change are preserved. A check date does not invent an intake year.

Ranking score graphs use rounded blue tracks with a hatched interval when a publisher reports a range. The literal published range remains visible. Historical charts use linear connections only within a matching population/program/period; conflicting same-year values remain in the source table and never become fabricated line points. Population switching and source records remain accessible with fewer than two comparable years. Regional rows now have actual university identity links and logos where sourced, plus a separate publisher source.

Cost tables keep the latest reported year for each category, population, currency, period, and programme. An older-only category remains visible with its year. These figures do not become current fee quotes simply because they are the latest installed observation.

Scholarship discovery excludes closed cycles by default, labels unknown/current-cycle status, respects exact award slugs, and uses the result count for pagination. Five reviewed 2027-entry awards link to Toronto, ETH, Oxford, UBC and Stanford, alongside the earlier MIT reference record. The homepage shows upcoming linked awards; profiles show their awards and official funding routes. Eight scoped application dates retain either a date-only value or a sourced timestamp/time zone. Hosted queries request verified, published records and fail visibly instead of showing old results under new filters.

Admin records have scoped search, accurate live counts, 25-row pagination, request-race protection and role-gated mutation. The dashboard loads owner-scoped saves, plans, checklists and comparisons, with visible failures and reload. Successful save animations occur only after confirmed persistence. Error pages provide search and useful recovery links. No fake login or admin bypass is present.

Resources has actionable planning tools and a searchable guide list. Invalid guide routes return a real 404. Comparison now has a full-name university finder, server-rendered initial selections, reorderable columns and uniform category/difference/missing-value controls across metrics, rankings and research. Shared URLs retain the exact canonical selection. CSV export preserves sources and scope and escapes spreadsheet formula cells. Save, share, and export actions require at least two loaded universities; failures remain visible with retry.

The cached ROR reconciliation adds 648 university identities and restores 1,146 ranking-to-profile joins, including UCL and NUS. The catalogue now contains 8,985 profiles in 175 countries; 4,813 installed ranking records link to profiles and 384 remain unmatched. Matching accepts only a unique exact registered name/alias in the publisher's country, retains campus qualifiers and keeps existing IDs. The review journal and reproducible command are documented in `docs/LOCAL-DATA-PIPELINE.md`.

## Repository cleanup

Removed 30 unused files: earlier landing/statistics prototypes, six unused illustration components, their exclusive assets, empty accidental files, generated TypeScript metadata, unused D1/SQLite schema/examples, and generator-specific hosting/install scripts. Drizzle dependencies and its obsolete generation command were removed. One Vinext launcher handles development and production builds; Wrangler state stays in ignored `.wrangler/`. TypeScript metadata and Python cache/virtualenv files are ignored.

The Vinext/Cloudflare runtime and optional server-side research provider are active code and remain in use. Published data, source attribution, SQL migrations, and existing user work were preserved.

## Verification

TypeScript, ESLint, all 69 automated tests and the production build passed on 2 October 2026. The build still reports large client chunks and incomplete Vinext route classification; neither failed the build. Earlier reconciliation reruns produced the same 648 added identities and 1,146 restored joins. Eleven official logo and three newly collected photograph checksums pass. The existing video is silent H.264, 30-second, 1200×800, 24fps.

The read-only localhost HTTP smoke suite also passed. It verifies 18 main routes, section/legacy links, scholarship server rendering, real 404s, API access controls, publisher-table pagination, platform assets, compact profile controls, readable search chips, a populated MIT/Harvard comparison before hydration, restored UCL/NUS ranked profiles, new Toronto/Cambridge requirements, licensed Cambridge/HKU galleries, and regional profile links. Browser interaction, visual appearance and hosted services remain outside this verification. The owner requested minimal computer use and will review the visual result.

Domain tests cover legacy section links, older cost coverage, separation of programme/population/currency/period, impossible award dates, closed-cycle opt-in, publication filters, exact award slugs, comparison URLs/filters/CSV, safe social URLs, Programs, ranking reconciliation, bounded lens maps, score bands, conflicting history values, gallery licenses and test-scale policy. PostgreSQL tests execute the actual reviewed award/date/requirement import twice and verify public-read rules and date precision constraints.

`npm run supabase:bundle` generates reviewable SQL for 13 migrations, 8,985 identities, five awards, eight dates and eight requirements. It does not execute remotely. Schema installation needs SQL Editor or a database connection. `supabase:review-account` checks real Auth/database prerequisites and, only with `--create`, creates an admin account and private review data using a server secret. The readiness check correctly refused with only the supplied publishable key; no account has been created.

Visual review is requested from the project owner on desktop and mobile. HTTP rendering checks do not establish browser interaction, autoplay behavior, or hosted authentication.

## Remaining gaps

- Hosted Supabase tables and data have not been installed or exercised with administrative access. The supplied publishable configuration supports connection but cannot perform migrations.
- Current requirements, deadlines, individual awards, official logos, and licensed campus photographs need more source coverage. Generic guidance and official links are shown where institution-specific records are absent.
- Selected QS regional rows are sourced, but regional coverage is incomplete. Preserve publisher bands/ties; do not derive an exact external rank for an unranked university.
- Cold local compilation and mapping/chart dependency sizes still need monitoring. Further CSS consolidation should preserve the approved navbar and typography.
- The requested GitHub remote needs access verification before pushing or enabling its refresh workflows.

The linked Obsidian notes in `/Users/likeanew/Downloads/CollegeStat` track decisions, bugs, coverage prompts, and release checks.
