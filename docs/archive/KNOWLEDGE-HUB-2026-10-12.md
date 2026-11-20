# Knowledge Hub implementation — 12 October 2026

This dated update supersedes the public Articles/Resources description in `ARTICLES-AND-STAFF-STRUCTURE-2026-10-12.md`. Its staff database structure work remains separate.

The user's pasted “CollegeStat — The Ultimate University Preparation Platform” brief is a product roadmap. This implementation applies its Knowledge Hub direction to the existing app rather than rebuilding the project or replacing Supabase. It does not claim the whole roadmap is complete.

## Actual changes

- Public navigation now says **Articles** and opens `/articles`. The approved navbar geometry and six links are preserved. Article reader URLs retain the active Articles state.
- `/resources` now redirects to `/articles`. Established `/resources/:id` guide URLs redirect to their canonical article. The application, destination and optional practice query bookmarks lead to the relevant original article or article topic.
- **16 original CollegeStat guides:** the six established IDs remain and their bodies were expanded. Ten new articles cover qualification purposes, TOEFL's 2026 score scale, UK/Germany/Canada/Uzbekistan/Singapore-and-Hong-Kong/UAE application research, learning from official essay examples, and interpreting admission rates.
- Six article topics, case-insensitive search, counts, empty-state recovery, estimated reading time, a clear author/update date, scope and cycle notes, contents navigation, official citations, related reading and an actionable checklist.
- External destination references are inside the relevant readers. The Articles page no longer appends a second public resource listing or presents official links as newly written articles.
- Small existing editorial thumbnails accompany the original six guides. New articles use simple topic icons. No remote images, copied protected essays, transcripts or test questions were imported.
- Existing student planner, rehearsal, certificates, optional official study links and account-scoped checklist state remain at their original dashboard URLs. Article and related-reading links stay in the dashboard when used there.

## Sources and scope

Primary references checked on 12 October 2026 include UCAS, uni-assist, DAAD, EduCanada, IELTS, ETS, Common App, Johns Hopkins admissions, NUS, HKUST, WIUT, the Uzbekistan assessment agency, NCES and the UAE ministry. Most links were read directly through the web tool. The Uzbekistan 2026/27 page and NCES cohort page had fetch timeouts but their official indexed results were checked; no specific admission thresholds or new statistical values were inferred from those results.

The UK article explicitly scopes the 13 January 2027 UCAS deadline to the courses outside its 15 October group. The TOEFL article retains the 21 January 2026 reporting change and does not convert student scores or create institution requirements. The UAE article explicitly labels the linked 8 January 2025 federal document as historical and requires checking current institutional criteria. NUS/HKUST and WIUT are institution examples, not rules for an entire country or region.

The essay guide links to Johns Hopkins' authorized publisher collection. It does not republish student essays or claim that an essay proves an acceptance rate. Its short planning example and the admission-rate arithmetic are explicitly fictional.

These are original app-served articles, **not newly installed university facts or a hosted article CMS**. No Supabase schema, university statistics or ranking rows were changed by this work. A draft/review/version workflow for administrator-authored articles remains a further integration task.

## Verification

- Four new domain checks passed: legacy ID/citation/related-link integrity, meaningful topic searches, historical/fictional scope safeguards, and safe redirect/workspace mapping.
- Together with the existing resource-state and workspace-navigation suites: **21 tests passed**.
- Scoped lint: **zero errors and warnings**.
- Browser: **14 checks passed, zero page errors or network writes** in the public journeys. All sixteen reader URLs, four legacy redirects, category/search/reset/keyboard behavior, checklist restore and light/dark layouts at 1440/768/390/330/320 pixels were exercised.
- A separate **synthetic student** fixture intercepted all private Supabase traffic and confirmed the application rehearsal, eight optional study-provider links and workspace article links still work. It performed no private hosted write.
- Captures were visually inspected. The initial IPv6 preview issue was resolved by root restarting the local server on `127.0.0.1:5173`; it was not treated as a passed browser run.

Reproduce:

```sh
node --import tsx --test tests/articles-knowledge-oct12.test.ts tests/resource-library-state-oct11.test.ts tests/workspace-navigation.test.ts
node outputs/verify-articles-knowledge-oct12.mjs
```

Browser receipts and captures: `outputs/articles-knowledge-browser-oct12.json`, `articles-knowledge-light-oct12.png`, `articles-knowledge-dark-oct12.png`, `article-reader-light-oct12.png`, `article-reader-dark-oct12.png`.
