# General university ranking additions · 15 October 2026

The ranking explorer and university profiles now show actual Webometrics positions. uniRank shows a small, explicitly labelled collection of university-reported positions. General university ranking cards precede specialist research measurements. The new tables run from reviewed local snapshots and require no hosted database writes.

## Webometrics identity and edition

The imported source is **Isidro F. Aguillo, Ranking Web of Universities (webometrics.info), July 2026, corrected version 3**, published on 10 August 2026. The source is the author's release from Cybermetrics Lab (IPP-CSIC), not another service using a similar name.

- [Versioned author release](https://doi.org/10.6084/m9.figshare.33062150.v3)
- [Public metadata, author and CC BY 4.0 license](https://api.figshare.com/v2/articles/33062150)
- [79-page source PDF](https://ndownloader.figshare.com/files/67397631)
- [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

Source PDF MD5: `41e9d92956b3d0998e550704bb763cd3`.

The public report is a **top-15-per-country selection**, with omissions as published. It does not contain the full commercial table of over 32,000 institutions. We do not claim complete worldwide coverage or fill missing positions by inference.

The public file yields 2,250 country-coded rows across 220 country and publisher-region groups. Standard territory names use `Intl.DisplayNames`; publisher-specific `TY` and `EU` codes remain explicitly labelled as publisher regions, without assigning guessed country identities. Fourteen additional rows lack a country code or concern international reporting units; these remain excluded in `data/review/webometrics-source-review-oct15.json`. Of the country-coded rows, **1,776 institutions link to an existing catalog profile**: 1,770 by unique exact ROR plus country, six by unique exact domain plus country without a conflicting ROR. The remaining 474 source rows can be read in the explorer but do not attach to a local profile. Fuzzy matches, ambiguous identities and cross-country matches are not used.

World and country positions remain separate, including identical published world numbers. Country filtering never recalculates rank. Each profile position links to its PDF page. Attribution and license are shown in the explorer.

Reproduce the snapshot with `scripts/ingestion/review-webometrics-oct15.py`, passing the downloaded PDF and its metadata JSON. The script verifies DOI, license, file checksum, row counts, country ranks and uniqueness of linked profile identities before writing local review and publication files.

Profiles import a compact ID/position index instead of the full explorer table: 160 KB before compression, 67 KB gzip, compared with 757 KB / 160 KB gzip for the full source. The complete multilingual source rows remain limited to the explorer module. Tests compare every compact index entry to its reviewed source row.

## uniRank: limited university announcements

No uniRank table, directory, descriptions or images were scraped or republished. These are individual factual positions in official 2026 university announcements, attributed at the result:

| Institution | World | Country | Official evidence |
| --- | ---: | ---: | --- |
| Visayas State University | 6,242 | Philippines 25 | [8 April 2026 university announcement](https://www.vsu.edu.ph/articles/news/2963-back-on-top-vsu-climbs-national-ranking-returns-top-spot-in-ev-in-2026-unirank) |
| Tshwane University of Technology | 1,202 | South Africa 9 | [24 June 2026 university announcement](https://www.tut.ac.za/newsroom/all-news/2026/tut-secures-9th-spot-nationally-and-rises-higher-in-global-unirank-digital-rankings.php) |
| Universitas Muhammadiyah Surabaya | Not reported | Indonesia 26 | [7 April 2026 university announcement](https://www.um-surabaya.ac.id/news/umsura-peringkat-1-pts-terbaik-di-jatim-versi-unirank-2026-masuk-26-nasional) |

These five positions cover only three institutions and are explicitly marked **university reported**. uniRank measures non-academic web presence and popularity; it is not presented as an academic-quality score. No world position is invented for UMSURA. The publisher website remains available for its complete tables.

## Product routes and verification

- `/rankings?provider=webometrics`
- `/rankings?provider=unirank`
- Existing university profiles show linked world/country values in the rankings panel. Every profile also exposes both publishers and an accurate partial-coverage state when no position is linked.
- Tests in `tests/directory-rankings-oct15.test.ts` verify every linked source identity against the catalog, source attribution, coverage limits, original positions after filtering, missing-rank handling, and profile country/ROR guards.
