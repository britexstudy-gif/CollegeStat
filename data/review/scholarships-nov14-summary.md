# Scholarship collection — 14 November 2026

## Staged dataset

- [scholarships-nov14.json](scholarships-nov14.json) contains **88 unique staged records**.
- **64** records are linked to university IDs from `data/segment/targets.json`; every linked ID was checked against that list.
- All records include the requested nationality, Central Asia eligibility, coverage, amount/currency, level, deadline, application, document and source fields. Every record has `checked_at: 2026-11-14` and `verification_status: staged`.
- Official sources only: university/provider sites, government sites and official scholarship portals.

Coverage by destination: South Korea 15; United States 11; Singapore 10; Canada 9; United Kingdom 8; China and Hong Kong 6 each; Türkiye 5; Japan 4; Italy 3; one each for Brunei, Cyprus/METU Northern Cyprus Campus, Germany, Erasmus+, Hungary, Kazakhstan/Bolashak, Poland, Romania, Russia, Tajikistan and Uzbekistan.

## Central Asian eligibility

- 72 awards are marked `central_asia_eligible: true` based on broad international eligibility or stated Central Asian access.
- 6 are marked `false`: Oxford’s Hill Foundation and OCIS awards, SNU’s Korean War Memorial award, NTU and NUS ASEAN awards, and NUS’s Goh Keng Swee award. Their published country/residency or family criteria exclude the four target nationalities.
- 10 are `null` because country quotas, sending-partner agreements, country-specific calls or individual award rules need confirmation. Where the official source did not establish eligible countries, `eligible_nationalities` is also `null`.

## Government and exchange programmes covered

The file includes GKS embassy and university routes; Türkiye Scholarships; Stipendium Hungaricum; CSC Type A and university Type B; MEXT embassy and university recommendation; Brunei’s 2027/28 award; Romania’s non-EU MFA scholarship; Russian government quota; Erasmus+ credit mobility; El-yurt umidi; the 2026-limited Bolashak bachelor category; Tajikistan’s 2027 Durakhshandagon scholarship; NAWA General Anders for Polish diaspora; Global UGRAD; and JASSO exchange and privately financed student support.

## Scope notes and exclusions

- **Czech government awards:** the official Czechia overview describes government scholarships for full master’s and doctoral degrees, so no government bachelor award was added. University-level awards can still be available; the target catalogue’s listed universities should be checked individually. [Study in Czechia overview](https://www.studyin.cz/soubory/clanky/0021_publications/Publikace-Czech-Higher-education-aktualizace-2024-II-web.pdf)
- **DAAD:** DAAD says full-course funding for bachelor programmes and first-year students is exceptional. The dataset includes the separate Deutschlandstipendium, which international students can apply for through participating universities; it does not present that federal/private co-funded scheme as a DAAD bachelor award. [DAAD funding options](https://www.daad.de/en/studying-in-germany/scholarships/funding-options/)
- **NAWA:** General Anders is included because it supports bachelor study for applicants of Polish descent, including people from diaspora communities in Central Asia. Banach and Poland My First Choice are second-cycle/master’s programmes and were not entered as bachelor scholarships. [General Anders bachelor call](https://nawa.gov.pl/en/students/foreign-students/the-gen-anders-programme/calls-for-proposals-2026/bachelor-studies), [Banach programme](https://nawa.gov.pl/en/students/foreign-students/the-banach-scholarship-programme/about-the-programme), [Poland My First Choice](https://www.nawa.gov.pl/en/students/foreign-students/poland-my-first-choice-programme/about-the-programme)
- **Malaysia:** the Malaysian International Scholarship is for postgraduate study, so it is not listed as a bachelor award. No international bachelor government scholarship was added based on the official Ministry information reviewed. [Malaysia International Scholarship](https://biasiswa.mohe.gov.my/INTER/)
- **Bolashak:** since 2026, the bachelor category is restricted to winners or prize-winners of approved international Olympiads or science-project competitions; it is included with that restriction rather than described as a general award. [Kazakhstan government eligibility](https://www.gov.kz/situations/8/intro?lang=en)
- **Kyrgyzstan:** no current outbound government bachelor scholarship was verified in the official sources reviewed. This collection includes the relevant international calls routed through government partners when their specific programme terms were available; check future Kyrgyz Ministry notices for new calls.
- **Global UGRAD:** included as undergraduate exchange, not degree funding. Its 2027 call and country participation were not confirmed on the checked global page, so dates, eligible nationalities and Central Asian eligibility remain `null`. [Global UGRAD](https://www.globalugrad.org/apply/)

## Data caution

Most 2027 institution and embassy deadlines have not yet been published or vary by country, university or application route; those dates are `null` rather than extrapolated. Several university awards are automatic or depend on admission and later nomination. Amounts are `null` where the official page did not state a reliable figure for the relevant award and cycle. The two dated exceptions that already include 2026 deadlines (Toronto Pearson) are retained as cycle-specific because the source page expressly lists those dates for September 2027 entry.
