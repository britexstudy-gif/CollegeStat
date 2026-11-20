# Ranking explorer and profile sources — 15 October 2026

## Delivered

- A ranking explorer introduction, a visible rail for all six installed systems, and a clearly separated directory of seven external publisher references. The directory is now available on the national view as well as the world and regional views.
- Profile cards for sourced world, regional and national positions. The cards read the profile's verified, permitted ranking entries, including existing NCSES HERD and NIRF positions, and retain the source's edition, category, geography, ties and bands.
- Leiden's reviewed scientific-impact indicators are now available in the university Rankings tab. No overall Leiden ordinal has been created.
- A TIME / Statista 2026 publisher-methodology reference. This adds one external system to the directory; it does not add any university positions or claim an imported table.
- A fresh primary-page check for THE's 2027 publisher release. CollegeStat's installed THE 2026 edition remains labelled 2026.
- Responsive card and table styling using CollegeStat cobalt `#245fe8`, neutral surfaces and ice blue accents. New styling is scoped to `.rankings-studio` and `.profile-ranking-studio`, with one import in `app/layout.tsx`.

There were **zero newly imported ranking positions**, **zero database writes**, and no new permission claims. Existing reviewed national positions and Leiden indicators are exposed more clearly in the interface.

## Primary publisher checks

Checked through native web research on 15 October 2026. External pages inform the source directory; a publisher's current edition does not automatically replace an installed dataset.

| Publisher | Primary page | Verified point and implementation decision |
| --- | --- | --- |
| QS | https://www.topuniversities.com/qs-top-uni-wur | Publisher displays the 2027 world edition. Existing QS 2027 observations are retained; no new table imported. |
| Times Higher Education | https://www.timeshighereducation.com/world-university-rankings/latest/world-ranking | Publisher displays World University Rankings 2027. Updated release-notice check date; installed 2026 observations remain unchanged. |
| ShanghaiRanking | https://www.shanghairanking.com/rankings/arwu/2026 | Publisher displays ARWU 2026 and 1,000 published institutions. Existing labels and rank bands are retained. |
| CWTS Leiden Open | https://open.leidenranking.com/resources | Publisher states that results and underlying data use a CC0 public-domain dedication. Only existing reviewed profile indicators are displayed. |
| CWTS Leiden Open | https://open.leidenranking.com/information/indicators | The 2025 indicator documentation identifies the 2020–2023 publication period. Indicators retain their measurement window and counting method. |
| NCSES HERD | https://ncses.nsf.gov/surveys/higher-education-research-development/2024 | Official FY2024 survey and expenditure-position tables. Existing verified profile positions are labelled research expenditure, separately from overall university quality. |
| NIRF | https://www.nirfindia.org/Rankings/2025/Ranking.html | Official 2025 category directory. No later release was established by this check, so the installed 2025 selection remains 2025. The existing permission boundary is the Ministry-authored PIB selection, not the complete NIRF tables. |
| NIRF / PIB | https://www.pib.gov.in/PressReleasePage.aspx?PRID=2163711&lang=1&reg=3 | Existing source and attribution link for the installed Ministry-published selection; preserved, with no new table ingestion. |
| CWUR | https://www.cwur.org/2026.php | Verified current publisher identity and 2026 edition. Retained as an external reference; no redistribution permission established. |
| TIME / Statista | https://time.com/7346375/worlds-top-universities-methodology-2026/ | Verified 2026 publisher methodology: academic performance, innovation and global engagement. Added methodology link as an external-only reference; no positions copied. |
| U.S. News | https://www.usnews.com/education/best-global-universities | Direct retrieval returned an error. No edition or reuse permission was inferred; the existing external link remains. |
| URAP | https://urapcenter.org/ | Direct page returned no readable content. Existing external metadata was not promoted to verified current data. |
| SCImago | https://www.scimagoir.com/methodology.php | Official methodology reference remains external. No position data imported or new licence claim made. |
| uniRank | https://www.unirank.org/terms/ | Existing terms reference remains external. No directory, positions, logos or images imported. |

The CSIC Webometrics identity-review status is unchanged. Similarly named independent publishers have not been merged.

## Position handling

`lib/profile-ranking-positions.ts` combines existing world highlights, existing regional observations and verified relational positions. Relational records must belong to the exact university, have source and verification metadata, have a permitted edition, and use an installed system. Unsafe source URLs are excluded. Leiden and external-only systems cannot manufacture ordinal positions.

The latest edition is selected independently for each provider, geography and category. Ties and bands retain their publisher labels. Conflicting labels within the same latest edition are hidden for review. A missing record is displayed as unavailable coverage, never as a zero score or an assertion that the institution has never been ranked.

## Requested OpenCode public-source collection

Inspected the existing `scripts/run-public-muse-batch.mjs` and `scripts/run-muse.mjs` before attempting the installed CLI. Exactly one bounded public-source research job was launched at **17:02 Asia/Tashkent** on 15 October 2026, with a 90-second timeout, in `/tmp/collegestat-ranking-research-2026-10-15`.

The job was given a short public-publisher research prompt only, with a clean temporary HOME/XDG configuration and a minimal environment. It received no repository code, environment files, authentication material, student records, staff data, browser state or database rows. The requested task allowed only primary publisher research and one report file; it prohibited table ingestion, installations, database actions and agent delegation.

- Model requested: `opencode/muse-spark-1.3-contributor-free#xhigh`, matching the existing public-research launcher.
- Result: exit code **1**, immediate startup failure: `Standalone server exited before reporting readiness`.
- Timeout: false.
- Research report produced: none.
- Retry attempts: zero.
- Local receipt: `/tmp/collegestat-ranking-research-2026-10-15/receipt.json`.

Native primary-publisher research supplied the checks above. The failed CLI attempt is not represented as completed external research.

## Verification

- Full `npm run typecheck`: passed.
- Scoped ESLint for the touched ranking files and university integration: passed.
- Focused ranking regression suite: **29/29 passed** across current tables, world/regional scope resolution, preservation of ties/bands, provider routing, stale request handling and the new profile position rules.
- Final browser verification is owned by the coordinating agent. A background tab initially confirmed the new source/navigation content; that inspection preceded the CSS import and is not claimed as final visual verification.

New focused tests cover exact-university verification gates, permitted editions, unsafe source URLs, unverified records, preserved national subjects/scopes/bands, latest-edition selection, conflicting observations, and the external-only TIME reference.
