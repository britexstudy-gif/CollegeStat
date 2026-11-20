# CollegeStat datasets register

Every source the catalogue uses or could use. Status: **live** (on the site),
**applied** (built into the next D1 release), **running** (collection in progress),
**candidate** (found, not imported), **rejected** (checked, not usable).

All imported rows keep their source URL and retrieval date. The public site labels
rows as official, national rule, or AI-checked (read from the official page by an
AI, not reviewed by a person).

## In use

| Dataset | Region | What it gives | Licence / access | Status | Pipeline |
|---|---|---|---|---|---|
| IPEDS (US Dept. of Education) | US | Tuition, fees, admit rate, enrolment, SAT/ACT ranges | Public domain | live | data/published (Oct 2026) |
| QS, THE, ARWU rankings (permitted editions) | World | Ranks | Publisher terms, linked | live | ranking_entries |
| Leiden Ranking | World | Research indicators | CC BY | live | research_metrics |
| ROR | World | Names, websites, aliases, ids | CC0 | live | identifiers |
| Wikidata / Wikimedia Commons (P18 photos) | World | Campus photos with author + licence | CC0 data, free-licence photos | running | scripts/data-ops/commons-photos.mjs |
| Wikidata (P154 logos, P571 founded) | World | Official logos, founding year | CC0 data, Commons files | running | scripts/data-ops/wikidata-logos.mjs |
| UCAS 2027 entry deadlines | UK (182 universities) | 13 Jan 2027; Oxford/Cambridge 15 Oct 2026 | Official page | applied | scripts/data-ops/national-rules.py |
| Universityadmissions.se autumn 2027 | Sweden (36) | International round closes 15 Jan 2027 | Official page | applied | national-rules.py |
| Studyinfo.fi joint application | Finland (37) | English-taught round 7-21 Jan 2027 | Official page | applied | national-rules.py |
| Codex gap-fill (Nov 18) | 500 top targets | Deadlines, tuition, IELTS, fees from official pages | AI-researched, sourced | live | data/review/codex-gaps-nov18 |
| DeepSeek reader (Nov 20) | Targets + Central Asia, Asia, Europe | Tuition, IELTS, deadlines, SAT of admitted, admit rate; quote-checked | AI-read official pages | running | scripts/data-ops/deepseek-gaps.mjs |
| Manual research (Nov 20) | UCL, Yale, Chicago | Tuition, IELTS, deadlines | Official pages | applied | data/review/freebuff-nov20 |

## Candidates

| Dataset | Region | What it gives | Access | Next step |
|---|---|---|---|---|
| KOSAF average tuition per university (data.go.kr 3071171) | Korea | Official yearly tuition per university, updated each April | Free; needs data.go.kr account + API key | Owner signs up, then import |
| Academy Info (academyinfo.go.kr) | Korea | Tuition, scholarships, admissions per university | Public portal | After KOSAF |
| DAAD International Programmes | Germany | English-taught programmes: tuition, language level, deadlines | Public pages / merged PDF | Read with the DeepSeek reader |
| ETER | Europe (3,500 HEIs) | Enrolment, international share, fields | Free Excel | Import enrolment + international share |
| Uzbekistan ministry: list of higher education institutions | Uzbekistan | Official university register | gov.uz | Check for new universities |
| data.egov.kz | Kazakhstan | Possible university register | Open data portal | Search |
| JASSO statistics | Japan | International student numbers | Public | Low priority |
| Study in Korea (KEDI) | Korea | National average tuition 2020-2025 | Web tables | Context only |

## Rejected

| Dataset | Why |
|---|---|
| Eurydice student fees | Latest data 2023/24; country-level only |
| Studielink 1 May deadline (Netherlands) | EU/EEA rule; non-EU deadlines are often earlier, per university |
| Samordna opptak / optagelse.dk | No single date for non-EU applicants |
| Uzbekistan open data tuition (olddata.gov.uz) | Dated 2020 |
| DuckDuckGo search for discovery | Blocks automated requests; sitemaps used instead |

## Newest releases (checked 20 Nov 2026)

| Dataset | Newest release | What we use now | Action |
|---|---|---|---|
| College Scorecard (US) | 2 Nov 2026: institution data to 2025-26 | IPEDS snapshot, Oct 2026 | Refresh US tuition, admit rate, enrolment from the bulk file |
| THE World University Rankings | 2027 edition, 30 Sep 2026 (2,297 institutions) | THE 2026 | Update when a permitted data feed is available |
| QS World University Rankings | 2027 edition, 18 Jun 2026 | QS 2027 | Current |
| QS Asia University Rankings | 2027 edition, 3 Nov 2026 (1,722 Asian universities) | Not used | Candidate: Asian rank for Korea, China, Malaysia, Central Asia |
| HESA student statistics (UK) | 2024/25, published 2026 (CC BY 4.0) | Not used | Candidate: international and EU share per UK university |
| ROR registry | v2.12, Aug 2026 (137,398 records, CC0) | Older ROR snapshot | Refresh identities and websites |
| KOSAF tuition (Korea) | April 2026 disclosure | Not used | Needs data.go.kr key |
| UCAS / universityadmissions.se / Studyinfo.fi | 2027-entry dates | Applied | Current |
