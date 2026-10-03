# September 2026 redesign

The landing page uses open editorial sections, original generated artwork, and a looping Embla university carousel. Autoplay advances every four seconds, pauses on hover/focus or with the pause button, skips hidden tabs, and respects reduced motion. The Finder-style search uses translucent layers, blur, a specular border, category navigation, keyboard navigation, Escape, and Cmd/Ctrl-K. The effect is a browser implementation, not Apple's native rendering engine.

University and ranking pages use rows and typographic hierarchy rather than nested cards. Rankings show selected source-linked QS 2026, THE 2026, and ARWU 2025 positions, preserve ties, link every position to a source, and paginate. Leiden Open indicators remain separate. These are bounded factual highlights, not licensed copies of complete publisher datasets.

The signed-in dashboard has a sidebar, checklist progress, upcoming saved deadlines, and the existing persisted shortlist, notes, lists, comparisons and searches. Sign-in and sign-up links carry the dashboard return destination. Unconfigured OAuth buttons are hidden.

## Data installed

- 10,248 deduplicated Hipo directory records across 200 countries. Together with the existing reference profiles, there are 10,249 routes.
- 1,225 US institutions joined to IPEDS on unique exact website hosts within the US. Each UNITID is used once. Ambiguous joins are excluded.
- 973 directory records have reported Fall 2023 applicants/admitted values and derived admission rates. ACT percentiles and separate SAT section percentiles are retained when reported.
- Reported 2023–2024 tuition, mandatory fees, room/board, and 2022–2023 12-month enrollment are linked to the profiles. Suppressed, missing, and imputed values are omitted. Out-of-state tuition is not labeled as international tuition, and SAT section percentiles are not added into a synthetic composite.
- Existing ROR, OpenAlex, Wikidata, Scorecard, IPEDS and Leiden records are preserved.

Directory identities are community maintained, not accreditation checks. Data coverage varies by institution; no claim is made that every profile has admissions, courses, faculty or fees. Profiles show available information and official website links.

Sources: [Hipo directory](https://github.com/Hipo/university-domains-list), [IPEDS 2023 files](https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx?rtid=7&year=2023), [QS 2026 source publication](https://www.econ.muni.cz/do/econ/soubory/oddeleni/ozs/admissions/2026_QS_World_University_Rankings_1.2__For_qs.com__11.2025.pdf), [THE US positions](https://beta.timeshighereducation.com/student/best-universities/best-universities-united-states), [THE UK positions](https://beta.timeshighereducation.com/student/best-universities/best-universities-uk), [ARWU 2025](https://www.shanghairanking.com/rankings/arwu/2025).

Files: `data/published/global-directory.json`, `directory-manifest.json`, `directory-countries.json`, and `HIPO-LICENSE.txt`. The manifest records the source hash, retrieval date and counts. Raw releases stay under ignored `data/raw/`. The global data stays on the server; browser requests return featured profiles, search results, or a page of 24 institutions.

Rebuild after fetching the Hipo JSON/license and IPEDS ZIPs:

```sh
npm run ingest:global
```

## Real sign-in and hosted persistence

No Supabase credentials are configured in this checkout. Account creation and sign-in require a real Supabase project; no simulated session is provided. Public browsing and comparison work locally.

1. Apply all `supabase/migrations` in order, including `202609260001_directory_records.sql`. Existing seed files install the original reference profiles.
2. Configure the public URL and anon key in `.env.local` using the names in `.env.example`. Configure server secrets through `.dev.vars` for the Cloudflare runtime. Restart the dev server after environment changes.
3. Enable the desired Supabase authentication providers and add the application's `/auth/callback` URL to allowed redirects. Email sign-up confirmation is handled by Supabase.
4. Install the new directory identities so saved universities, lists, notes and history can reference their IDs. The sync command is a dry run by default. With server-side credentials set, use the explicit apply form below. It inserts missing IDs and preserves existing records, including the six original profiles.

```sh
npm run ingest:global:sync
npm run ingest:global:sync -- --apply
```

Hosted migration/import and live sign-in were not performed because this checkout has no Supabase configuration. The local application does not require those credentials for directory/profile access.

## Validation

TypeScript, ESLint, all 20 automated tests, production build and HTTP route smoke checks. Tests cover global identity/slug uniqueness, pagination and filters, a non-reference Harvard profile, source/edition/tie preservation, missing data semantics, and database ownership/RLS. No computer use or visual browser inspection was performed, as requested.
