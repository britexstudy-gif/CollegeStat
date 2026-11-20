# Segment data coverage — Central Asia bachelor's, intake 2027

Generated 2026-11-14 by `node --import tsx scripts/segment/coverage.ts`. Target list: `data/segment/targets.json` (DRAFT — for owner review).

**Summary: 3 of 204 target universities are report-ready; 0 are report-ready with all four parts current.**

Report-ready means all four of: (1) tuition with a stated currency and a stated year, (2) an English test minimum (IELTS/TOEFL/Duolingo score, or an explicit "no test required"), (3) an application deadline, (4) an official admissions page link — each with a source URL. "Report-ready, current" additionally needs tuition and the English minimum for academic year 2026–27 or 2027–28, a 2027-entry deadline and an admissions link checked in the last 365 days.

Targets meeting each part: tuition 32/204, english_minimum 24/204, deadline 11/204, admissions_link 81/204.
Report-ready by country: US 0/28 · GB 1/18 · DE 0/14 · KR 0/14 · TR 0/14 · MY 0/10 · CN 0/12 · JP 0/10 · IT 0/10 · HU 0/8 · PL 0/8 · CZ 0/6 · CA 0/10 · RU 0/10 · AE 0/6 · SG 0/4 · HK 1/6 · UZ 1/6 · KZ 0/4 · KG 0/4 · TJ 0/2.

Source of truth: the bundled catalogue (`data/generated/catalogue`, built from `data/published`) plus the server overlays the profile page adds in bundled mode (IPEDS US stats, Common App, Scorecard, reviewed enrichment). The hosted Supabase database was **not** read.

## Per-field coverage (204 universities)

"Present" = at least one stored value (a missing amount is never counted as zero; a stated zero is a value). "Sourced" = that value has an http(s) source or provenance URL. "Current" = a sourced value refers to the period in the last column; a year is only read from stored period/cycle/scope fields or the record's own year, never from a retrieval date.

| Field | Present | Sourced | Current | Current means |
|---|---|---|---|---|
| Tuition (currency + year) | 32 (16%) | 32 (16%) | 10 (5%) | academic year 2026–27 or 2027–28 |
| Living cost | 28 (14%) | 28 (14%) | 4 (2%) | academic year 2026–27 or 2027–28 |
| Admission requirements (general) | 38 (19%) | 38 (19%) | 6 (3%) | academic year 2026–27 or 2027–28 |
| English test minimum | 24 (12%) | 24 (12%) | 2 (1%) | academic year 2026–27 or 2027–28 |
| Application deadline | 11 (5%) | 11 (5%) | 7 (3%) | 2027-entry round |
| Application fee | 28 (14%) | 28 (14%) | 1 (0%) | 2027-entry round |
| Linked scholarships | 31 (15%) | 31 (15%) | 3 (1%) | 2027-entry round |
| Official admissions page | 81 (40%) | 81 (40%) | 81 (40%) | link checked within 365 days |
| International students page | 15 (7%) | 15 (7%) | 15 (7%) | link checked within 365 days |
| Main website | 204 (100%) | 204 (100%) | 204 (100%) | link checked within 365 days |

## The 30 most impactful missing fields

Ordered by how few parts the university is missing from report-ready (fixing a 1-gap university unlocks a report), then alternating across destinations in brief order (US, GB, DE, KR, TR, MY, CN, JP, IT, HU, PL, CZ, CA, RU, AE, SG, HK, then UZ, KZ, KG, TJ), best-ranked first. "Where to look" is an official page we already store; "none stored" means we have no link for it.

| # | University | CC | Missing field | Why | Gaps to report-ready | Where to look (stored link) |
|---|---|---|---|---|---|---|
| 1 | Stanford University | US | Application deadline | not stored | 1 | https://commonapp.org/ |
| 2 | University of Toronto | CA | Tuition (currency + year) | no tuition stored | 1 | https://future.utoronto.ca/finances/fees |
| 3 | National University of Singapore | SG | Tuition (currency + year) | no tuition stored | 1 | https://www.nus.edu.sg/oam/admissions/admissions |
| 4 | California Institute of Technology | US | Application deadline | not stored | 1 | https://www.admissions.caltech.edu/apply |
| 5 | University of Manchester | GB | Tuition (currency + year) | no tuition stored | 1 | https://www.manchester.ac.uk/study/international/finance-and-scholarships/ |
| 6 | Nanyang Technological University | SG | Tuition (currency + year) | no tuition stored | 1 | https://www.ntu.edu.sg/admissions/graduate/financialmatters/financialaid |
| 7 | Massachusetts Institute of Technology | US | Application deadline | not stored | 1 | https://mitadmissions.org/apply/ |
| 8 | The University of Hong Kong | HK | English test minimum | not stored | 1 | https://admissions.hku.hk/apply/international-qualifications |
| 9 | University of California-Berkeley | US | Application deadline | not stored | 1 | https://admission.universityofcalifornia.edu/apply-now.html |
| 10 | University of Pennsylvania | US | Application deadline | not stored | 1 | https://www.admissions.upenn.edu/apply/ |
| 11 | Technical University of Munich | DE | Tuition (currency + year) | no tuition stored | 2 | https://www.tum.de/en/studies/fees/tuition |
| 12 | Technical University of Munich | DE | Application deadline | not stored | 2 | https://www.tum.de/en/studies/degree-programs |
| 13 | Tsinghua University | CN | Tuition (currency + year) | no tuition stored | 2 | https://www.tsinghua.edu.cn/en/Admissions.htm |
| 14 | Tsinghua University | CN | Application deadline | not stored | 2 | https://goglobal.tsinghua.edu.cn/en/tutorial/VaQRQPgaQr |
| 15 | Nazarbayev University | KZ | Tuition (currency + year) | no tuition stored | 2 | https://nu.edu.kz/admissions/how-to-apply/foundation-undergraduate/financial-aid-end-scholarships/ |
| 16 | Nazarbayev University | KZ | Application deadline | not stored | 2 | https://nu.edu.kz/?s=admissions |
| 17 | American University of Central Asia | KG | Tuition (currency + year) | no tuition stored | 2 | https://www.auca.kg/en/financial_aid/ |
| 18 | American University of Central Asia | KG | Application deadline | not stored | 2 | https://www.auca.kg/en/admissions/ |
| 19 | Fudan University | CN | Tuition (currency + year) | no tuition stored | 2 | https://iso.fudan.edu.cn/isoenglish/51327/list.htm |
| 20 | Fudan University | CN | Application deadline | not stored | 2 | https://econ.fudan.edu.cn/uipe/info/1005/1004.htm |
| 21 | University of British Columbia | CA | Tuition (currency + year) | no tuition stored | 2 | http://www.ubc.ca/admissions/ |
| 22 | University of British Columbia | CA | English test minimum | not stored | 2 | http://www.ubc.ca/admissions/ |
| 23 | The Chinese University of Hong Kong | HK | Tuition (currency + year) | no tuition stored | 2 | https://international.cuhk.edu.hk/infoguide/fees/ |
| 24 | The Chinese University of Hong Kong | HK | Official admissions page | not stored | 2 | https://www.cuhk.edu.hk/ |
| 25 | University of Edinburgh | GB | Tuition (currency + year) | no tuition stored | 2 | https://study.ed.ac.uk/undergraduate/applying |
| 26 | University of Edinburgh | GB | Application deadline | not stored | 2 | https://study.ed.ac.uk/undergraduate/applying |
| 27 | Shanghai Jiaotong University | CN | Tuition (currency + year) | no tuition stored | 2 | https://global.sjtu.edu.cn/en/study-sjtu/prospective/degree-programs/387 |
| 28 | Shanghai Jiaotong University | CN | Application deadline | not stored | 2 | https://gc.sjtu.edu.cn/admission/international-undergraduate-admission/application-requirements/ |
| 29 | McGill University | CA | Tuition (currency + year) | no tuition stored | 2 | https://www.mcgill.ca/student-accounts/tuition-fees/tuition-and-fees-tables-and-rates |
| 30 | McGill University | CA | English test minimum | not stored | 2 | https://www.mcgill.ca/undergraduate-admissions/apply/requirements/international/ib |

## Per-university coverage, most complete first

Cell legend: "✔ current" sourced and current · "sourced" has a source URL but the period is older or not stated · "unsourced" stored without a source URL · "—" not stored. Score = 2 per current field + 1 per sourced-only field (max 20).

| # | University | CC | Score | Report-ready | Tuition (currency + year) | Living cost | Admission requirements (general) | English test minimum | Application deadline | Application fee | Linked scholarships | Official admissions page | International students page | Main website | Years on record |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | [University of Oxford](/university/oxford) | GB | 15 | yes (not all current) | ✔ current | — | ✔ current | sourced | ✔ current | — | ✔ current | ✔ current | ✔ current | ✔ current | tuition: 2027–28; requirements: 2027 entry; english_minimum: year not stated; deadline: 2027 entry; scholarships: year 2027 |
| 2 | [The Hong Kong University of Science and Technology](/university/the-hong-kong-university-of-science-and-technology-74996b5e) | HK | 14 | yes (not all current) | ✔ current | — | ✔ current | sourced | ✔ current | — | sourced | ✔ current | ✔ current | ✔ current | tuition: 2027–28; requirements: 2027 entry; english_minimum: year not stated; deadline: 2027 entry; scholarships: year not stated |
| 3 | [Stanford University](/university/stanford) | US | 12 | no (deadline) | ✔ current | sourced | sourced | sourced | — | sourced | — | ✔ current | ✔ current | ✔ current | tuition: 2026–27; living_cost: year 2023; requirements: year not stated; english_minimum: year not stated; application_fee: 2023–24 |
| 4 | [California Institute of Technology](/university/california-institute-of-technology-99fbcf31) | US | 12 | no (deadline) | ✔ current | ✔ current | sourced | sourced | — | sourced | sourced | ✔ current | — | ✔ current | tuition: 2026–27; living_cost: 2026–27; requirements: year not stated; english_minimum: year not stated; application_fee: 2023–24; scholarships: year not stated |
| 5 | [Westminster International University in Tashkent](/university/wiut) | UZ | 11 | yes (not all current) | ✔ current | — | ✔ current | ✔ current | sourced | — | — | ✔ current | — | ✔ current | tuition: 2026–27; requirements: 2026–27; english_minimum: 2026–27; deadline: 2026 (only year stated) |
| 6 | [Massachusetts Institute of Technology](/university/mit) | US | 11 | no (deadline) | ✔ current | sourced | sourced | sourced | — | sourced | sourced | ✔ current | — | ✔ current | tuition: 2026–27; living_cost: year 2025; requirements: year not stated; english_minimum: year not stated; application_fee: 2023–24; scholarships: year not stated |
| 7 | [National University of Singapore](/university/national-university-of-singapore-c66c3755) | SG | 11 | no (tuition) | — | — | sourced | sourced | ✔ current | — | sourced | ✔ current | ✔ current | ✔ current | requirements: year not stated; english_minimum: year not stated; deadline: 2027 entry; scholarships: year not stated |
| 8 | [Yale University](/university/yale-university-0a670c6d) | US | 11 | no (english_minimum, deadline) | ✔ current | ✔ current | sourced | — | — | sourced | sourced | ✔ current | — | ✔ current | tuition: 2026–27; living_cost: 2026–27; requirements: year not stated; application_fee: 2023–24; scholarships: year not stated |
| 9 | [The Chinese University of Hong Kong](/university/the-chinese-university-of-hong-kong-7deae08f) | HK | 11 | no (tuition, admissions_link) | — | — | sourced | sourced | ✔ current | ✔ current | sourced | — | ✔ current | ✔ current | requirements: year not stated; english_minimum: year not stated; deadline: 2027 entry; application_fee: 2027 entry; scholarships: year not stated |
| 10 | [University of California-Berkeley](/university/university-of-california-berkeley-e67501b3) | US | 10 | no (deadline) | sourced | sourced | sourced | sourced | — | sourced | sourced | ✔ current | — | ✔ current | tuition: year 2023; living_cost: year 2023; requirements: year not stated; english_minimum: year not stated; application_fee: 2023–24; scholarships: year not stated |
| 11 | [University of Pennsylvania](/university/university-of-pennsylvania-894119e1) | US | 10 | no (deadline) | sourced | sourced | sourced | sourced | — | sourced | sourced | ✔ current | — | ✔ current | tuition: year 2023; living_cost: year 2023; requirements: year not stated; english_minimum: year not stated; application_fee: 2023–24; scholarships: year not stated |
| 12 | [University of Manchester](/university/university-of-manchester-6e2ae583) | GB | 10 | no (tuition) | — | — | sourced | sourced | sourced | — | sourced | ✔ current | ✔ current | ✔ current | requirements: year not stated; english_minimum: year not stated; deadline: year not stated; scholarships: year not stated |
| 13 | [University of Toronto](/university/toronto) | CA | 10 | no (tuition) | — | — | sourced | sourced | ✔ current | — | ✔ current | ✔ current | — | ✔ current | requirements: year not stated; english_minimum: year not stated; deadline: 2027 entry; scholarships: year 2027 |
| 14 | [Johns Hopkins University](/university/johns-hopkins-university-f5c17f3c) | US | 10 | no (english_minimum, deadline) | ✔ current | sourced | sourced | — | — | sourced | sourced | ✔ current | — | ✔ current | tuition: 2026–27; living_cost: year 2023; requirements: year not stated; application_fee: 2023–24; scholarships: year not stated |
| 15 | [Nanyang Technological University](/university/nanyang-technological-university-f5a6d73a) | SG | 9 | no (tuition) | — | — | sourced | sourced | ✔ current | — | sourced | ✔ current | — | ✔ current | requirements: year not stated; english_minimum: year not stated; deadline: 2027 entry; scholarships: year not stated |
| 16 | [The University of Hong Kong](/university/the-university-of-hong-kong-b37d730b) | HK | 9 | no (english_minimum) | ✔ current | — | sourced | — | sourced | — | sourced | ✔ current | — | ✔ current | tuition: 2026–27; requirements: year not stated; deadline: year not stated; scholarships: year not stated |
| 17 | [Harvard University](/university/harvard-university-39230496) | US | 9 | no (english_minimum, deadline) | sourced | sourced | sourced | — | — | sourced | sourced | ✔ current | — | ✔ current | tuition: year 2023; living_cost: year 2023; requirements: year not stated; application_fee: 2023–24; scholarships: year not stated |
| 18 | [Columbia University in the City of New York](/university/columbia-university-1ad9abe1) | US | 9 | no (english_minimum, deadline) | sourced | sourced | sourced | — | — | sourced | sourced | ✔ current | — | ✔ current | tuition: year 2023; living_cost: year 2023; requirements: year not stated; application_fee: 2023–24; scholarships: year not stated |
| 19 | [University of Chicago](/university/university-of-chicago-7add53a9) | US | 9 | no (english_minimum, deadline) | sourced | sourced | sourced | — | — | sourced | sourced | ✔ current | — | ✔ current | tuition: year 2023; living_cost: year 2023; requirements: year not stated; application_fee: 2023–24; scholarships: year not stated |
| 20 | [Cornell University](/university/cornell-university-8488d97e) | US | 9 | no (english_minimum, deadline) | sourced | sourced | sourced | — | — | sourced | sourced | ✔ current | — | ✔ current | tuition: year 2023; living_cost: year 2023; requirements: year not stated; application_fee: 2023–24; scholarships: year not stated |
| 21 | [University of Edinburgh](/university/university-of-edinburgh-f2f2a71c) | GB | 9 | no (tuition, deadline) | — | ✔ current | sourced | sourced | — | — | sourced | ✔ current | — | ✔ current | living_cost: 2026–27; requirements: year not stated; english_minimum: year not stated; scholarships: year not stated |
| 22 | [Princeton University](/university/princeton-university-6f13f9e9) | US | 9 | no (english_minimum, deadline, admissions_link) | ✔ current | ✔ current | sourced | — | — | sourced | sourced | — | — | ✔ current | tuition: 2026–27; living_cost: 2026–27; requirements: year not stated; application_fee: 2023–24; scholarships: year not stated |
| 23 | [Boston College](/university/boston-college-61ee643d) | US | 8 | no (english_minimum, deadline) | sourced | sourced | sourced | — | — | sourced | — | ✔ current | — | ✔ current | tuition: year 2023; living_cost: year 2023; requirements: year not stated; application_fee: 2023–24 |
| 24 | [Fordham University](/university/fordham-university-99c5a4b8) | US | 8 | no (english_minimum, deadline) | sourced | sourced | sourced | — | — | sourced | — | ✔ current | — | ✔ current | tuition: year 2023; living_cost: year 2023; requirements: year not stated; application_fee: 2023–24 |
| 25 | [DePaul University](/university/depaul-university-eff27116) | US | 8 | no (english_minimum, deadline) | sourced | sourced | sourced | — | — | sourced | — | ✔ current | — | ✔ current | tuition: year 2023; living_cost: year 2023; requirements: year not stated; application_fee: 2023–24 |
| 26 | [University of Cambridge](/university/university-of-cambridge-ae117645) | GB | 8 | no (tuition, deadline) | — | — | ✔ current | sourced | — | — | sourced | ✔ current | — | ✔ current | requirements: 2027 entry; english_minimum: year not stated; scholarships: year not stated |
| 27 | [University of British Columbia](/university/university-of-british-columbia-276cad09) | CA | 8 | no (tuition, english_minimum) | — | — | — | — | ✔ current | — | ✔ current | ✔ current | — | ✔ current | deadline: 2027 entry; scholarships: year 2027 |
| 28 | [American University of Central Asia](/university/american-university-of-central-asia-48bb7649) | KG | 8 | no (tuition, deadline) | — | — | sourced | sourced | — | — | — | ✔ current | ✔ current | ✔ current | requirements: year not stated; english_minimum: year not stated |
| 29 | [University of California-Los Angeles](/university/university-of-california-los-angeles-d5ba03bb) | US | 7 | no (english_minimum, deadline) | sourced | sourced | — | — | — | sourced | — | ✔ current | — | ✔ current | tuition: year 2023; living_cost: year 2023; application_fee: 2023–24 |
| 30 | [University of Washington-Seattle Campus](/university/university-of-washington-5d324277) | US | 7 | no (english_minimum, deadline) | sourced | sourced | — | — | — | sourced | — | ✔ current | — | ✔ current | tuition: year 2023; living_cost: year 2023; application_fee: 2023–24 |
| 31 | [Northwestern University](/university/northwestern-university-e48a723c) | US | 7 | no (english_minimum, deadline) | sourced | sourced | — | — | — | sourced | — | ✔ current | — | ✔ current | tuition: year 2023; living_cost: year 2023; application_fee: 2023–24 |
| 32 | [University of California-Irvine](/university/university-of-california-irvine-a13696ab) | US | 7 | no (english_minimum, deadline) | sourced | sourced | — | — | — | sourced | — | ✔ current | — | ✔ current | tuition: year 2023; living_cost: year 2023; application_fee: 2023–24 |
| 33 | [University of Arizona](/university/university-of-arizona-027e062a) | US | 7 | no (english_minimum, deadline) | sourced | sourced | — | — | — | sourced | — | ✔ current | — | ✔ current | tuition: year 2023; living_cost: year 2023; application_fee: 2023–24 |
| 34 | [George Washington University](/university/george-washington-university-7297ee6e) | US | 7 | no (english_minimum, deadline) | sourced | sourced | — | — | — | sourced | — | ✔ current | — | ✔ current | tuition: year 2023; living_cost: year 2023; application_fee: 2023–24 |
| 35 | [Virginia Commonwealth University](/university/virginia-commonwealth-university-14c47a79) | US | 7 | no (english_minimum, deadline) | sourced | sourced | — | — | — | sourced | — | ✔ current | — | ✔ current | tuition: 2023–24; living_cost: 2023–24; application_fee: 2023–24 |
| 36 | [Temple University](/university/temple-university-210dada7) | US | 7 | no (english_minimum, deadline) | sourced | sourced | — | — | — | sourced | — | ✔ current | — | ✔ current | tuition: year 2023; living_cost: year 2023; application_fee: 2023–24 |
| 37 | [Missouri University of Science and Technology](/university/missouri-university-of-science-and-technology-f973d34b) | US | 7 | no (english_minimum, deadline) | sourced | sourced | — | — | — | sourced | — | ✔ current | — | ✔ current | tuition: year 2023; living_cost: year 2023; application_fee: 2023–24 |
| 38 | [University of Toledo](/university/university-of-toledo-a5aa5750) | US | 7 | no (english_minimum, deadline) | sourced | sourced | — | — | — | sourced | — | ✔ current | — | ✔ current | tuition: year 2023; living_cost: year 2023; application_fee: 2023–24 |
| 39 | [The University of Texas at Arlington](/university/university-of-texas-at-arlington-141123a2) | US | 7 | no (english_minimum, deadline) | sourced | sourced | — | — | — | sourced | — | ✔ current | — | ✔ current | tuition: year 2023; living_cost: year 2023; application_fee: 2023–24 |
| 40 | [University of Massachusetts-Boston](/university/university-of-massachusetts-boston-175cb34b) | US | 7 | no (english_minimum, deadline) | sourced | sourced | — | — | — | sourced | — | ✔ current | — | ✔ current | tuition: year 2023; living_cost: year 2023; application_fee: 2023–24 |
| 41 | [Imperial College London](/university/imperial-college-london-5ad45ea9) | GB | 7 | no (tuition, deadline) | — | — | sourced | sourced | — | — | sourced | ✔ current | — | ✔ current | requirements: year not stated; english_minimum: year not stated; scholarships: year not stated |
| 42 | [Technical University of Munich](/university/tum) | DE | 7 | no (tuition, deadline) | — | — | sourced | sourced | — | — | sourced | ✔ current | — | ✔ current | requirements: year not stated; english_minimum: year not stated; scholarships: year not stated |
| 43 | [Tsinghua University](/university/tsinghua-university-519c66df) | CN | 7 | no (tuition, deadline) | — | — | sourced | sourced | — | — | sourced | ✔ current | — | ✔ current | requirements: year not stated; english_minimum: year not stated; scholarships: year not stated |
| 44 | [Fudan University](/university/fudan-university-5c9532a7) | CN | 7 | no (tuition, deadline) | — | — | sourced | sourced | — | — | sourced | ✔ current | — | ✔ current | requirements: year not stated; english_minimum: year not stated; scholarships: year not stated |
| 45 | [Shanghai Jiaotong University](/university/shanghai-jiaotong-university-40dc3bce) | CN | 7 | no (tuition, deadline) | — | — | sourced | sourced | — | — | sourced | ✔ current | — | ✔ current | requirements: year not stated; english_minimum: year not stated; scholarships: year not stated |
| 46 | [McGill University](/university/mcgill-university-b48ecdd6) | CA | 7 | no (tuition, english_minimum) | — | — | sourced | — | sourced | — | sourced | ✔ current | — | ✔ current | requirements: year not stated; deadline: year not stated; scholarships: year not stated |
| 47 | [Nazarbayev University](/university/nazarbayev-university-69434102) | KZ | 6 | no (tuition, deadline) | — | — | sourced | sourced | — | — | — | ✔ current | — | ✔ current | requirements: year not stated; english_minimum: year not stated |
| 48 | [King's College London, University of London](/university/king-s-college-london-university-of-london-01649f44) | GB | 6 | no (tuition, deadline, admissions_link) | — | — | ✔ current | sourced | — | — | sourced | — | — | ✔ current | requirements: 2027 (only year stated); english_minimum: year not stated; scholarships: year not stated |
| 49 | [Seoul National University](/university/seoul-national-university-6a9e2556) | KR | 6 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | ✔ current | ✔ current |  |
| 50 | [Korea University](/university/korea-university-6d72f6ce) | KR | 6 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | ✔ current | ✔ current |  |
| 51 | [Korea Advanced Institute of Science & Technology](/university/korea-advanced-institute-of-science-technology-bb32340f) | KR | 6 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | ✔ current | ✔ current |  |
| 52 | [Management and Science University](/university/management-and-science-university-046ea39b) | MY | 6 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | ✔ current | ✔ current |  |
| 53 | [University of Tokyo](/university/university-of-tokyo-11087dc1) | JP | 6 | no (tuition, english_minimum, deadline) | — | — | sourced | — | — | — | sourced | ✔ current | — | ✔ current | requirements: year not stated; scholarships: year not stated |
| 54 | [Doshisha University](/university/doshisha-university-43fbc6ab) | JP | 6 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | ✔ current | ✔ current |  |
| 55 | [Nagaoka University of Technology](/university/nagaoka-university-of-technology-2b795475) | JP | 6 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | ✔ current | ✔ current |  |
| 56 | [Kazakh British Technical University](/university/kazakh-british-technical-university-f0e54c4c) | KZ | 6 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | ✔ current | ✔ current |  |
| 57 | [University of Central Asia](/university/university-of-central-asia-b99019e6) | KG | 6 | no (tuition, deadline, admissions_link) | — | — | ✔ current | ✔ current | — | — | — | — | — | ✔ current | requirements: 2026 admission; english_minimum: 2026 admission |
| 58 | [SUNY Downstate Health Sciences University](/university/suny-downstate-health-sciences-university-9e6672b1) | US | 5 | no (english_minimum, deadline) | sourced | — | — | — | — | — | — | ✔ current | — | ✔ current | tuition: year 2023 |
| 59 | [London School of Economics and Political Science, University of London](/university/london-school-of-economics-and-political-science-university-of-london-3e655a74) | GB | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 60 | [Birkbeck College, University of London](/university/birkbeck-college-university-of-london-765d7982) | GB | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 61 | [School of Oriental and African Studies, University of London](/university/school-of-oriental-and-african-studies-university-of-london-2fdb419f) | GB | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 62 | [University of Hull](/university/university-of-hull-73764183) | GB | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 63 | [Rheinisch Westfälische Technische Hochschule Aachen](/university/rheinisch-westfalische-technische-hochschule-aachen-f7aaf172) | DE | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 64 | [Universiti Malaya](/university/universiti-malaya-ee31891b) | MY | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 65 | [Universiti Sains Malaysia](/university/universiti-sains-malaysia-b865e086) | MY | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 66 | [Universiti Kebangsaan Malaysia](/university/universiti-kebangsaan-malaysia-04c4aef9) | MY | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 67 | [Universiti Teknologi Malaysia](/university/universiti-teknologi-malaysia-1042123a) | MY | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 68 | [Universiti Malaysia Perlis](/university/universiti-malaysia-perlis-55d2f2a4) | MY | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 69 | [Universiti Kuala Lumpur](/university/universiti-kuala-lumpur-4a1a5857) | MY | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 70 | [Zhejiang University](/university/zhejiang-university-d4f88b7a) | CN | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 71 | [Kyoto University](/university/kyoto-university-e943a9a4) | JP | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 72 | [Osaka University](/university/osaka-university-b186f041) | JP | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 73 | [Institute of Science Tokyo](/university/institute-of-science-tokyo-1789110d) | JP | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 74 | [McMaster University](/university/mcmaster-university-aac099ab) | CA | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 75 | [University of Ottawa](/university/university-of-ottawa-950f15f4) | CA | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 76 | [Carleton University](/university/carleton-university-7d9b3d9d) | CA | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 77 | [Ontario Tech University](/university/ontario-tech-university-27a82309) | CA | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 78 | [University of Northern British Columbia](/university/university-of-northern-british-columbia-709e7cf7) | CA | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 79 | [Zayed University](/university/zayed-university-75014378) | AE | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 80 | [American University in Dubai](/university/american-university-in-dubai-497e221c) | AE | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 81 | [Singapore University of Technology and Design](/university/singapore-university-of-technology-and-design-a8c20c24) | SG | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 82 | [City University of Hong Kong](/university/city-university-of-hong-kong-c0bf548f) | HK | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 83 | [Hong Kong Baptist University](/university/hong-kong-baptist-university-d9597e4a) | HK | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 84 | [Inha University in Tashkent](/university/inha-university-in-tashkent-9e20a5d2) | UZ | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 85 | [Kazakhstan Institute of Management, Economics, and Strategic Research](/university/kazakhstan-institute-of-management-economics-and-strategic-research-3a93f754) | KZ | 4 | no (tuition, english_minimum, deadline) | — | — | — | — | — | — | — | ✔ current | — | ✔ current |  |
| 86 | [Yonsei University](/university/yonsei-university-b5f25065) | KR | 4 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | ✔ current | ✔ current |  |
| 87 | [Peking University](/university/peking-university-79e1cf8b) | CN | 4 | no (tuition, english_minimum, deadline, admissions_link) | — | — | sourced | — | — | — | sourced | — | — | ✔ current | requirements: year not stated; scholarships: year not stated |
| 88 | [University College London](/university/university-college-london-4b7862dc) | GB | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 89 | [University of Bristol](/university/university-of-bristol-ad695799) | GB | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 90 | [University of Durham](/university/university-of-durham-69452803) | GB | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 91 | [The Queen's University Belfast](/university/the-queen-s-university-belfast-0c842a32) | GB | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 92 | [Nottingham Trent University](/university/nottingham-trent-university-abe14bf9) | GB | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 93 | [Birmingham City University](/university/birmingham-city-university-b2142fd1) | GB | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 94 | [Cardiff Metropolitan University](/university/cardiff-metropolitan-university-e53f5fef) | GB | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 95 | [University of West London](/university/university-of-west-london-a322a7f8) | GB | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 96 | [Ludwig-Maximilians-Universität München](/university/ludwig-maximilians-universitat-munchen-3c2d87b3) | DE | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 97 | [Ruprecht-Karls-Universität Heidelberg](/university/ruprecht-karls-universitat-heidelberg-fe2070ba) | DE | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 98 | [Rheinische Friedrich-Wilhelms Universität Bonn](/university/rheinische-friedrich-wilhelms-universitat-bonn-41845441) | DE | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 99 | [Humboldt Universität Berlin](/university/humboldt-universitat-berlin-d2dff4b3) | DE | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 100 | [Eberhard-Karls-Universität Tübingen](/university/eberhard-karls-universitat-tubingen-04566891) | DE | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 101 | [Johann Wolfgang Goethe Universität Frankfurt am Main](/university/johann-wolfgang-goethe-universitat-frankfurt-am-main-76aa91bc) | DE | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 102 | [Friedrich-Alexander Universität Erlangen-Nürnberg](/university/friedrich-alexander-universitat-erlangen-nurnberg-db5390bb) | DE | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 103 | [Universität Konstanz](/university/universitat-konstanz-3158b0fa) | DE | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 104 | [Universität Hannover](/university/universitat-hannover-c7351cbe) | DE | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 105 | [Rheinland-Pfälzische Technische Universität Kaiserslautern-Landau](/university/rheinland-pfalzische-technische-universitat-kaiserslautern-landau-d5073301) | DE | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 106 | [Universität Augsburg](/university/universitat-augsburg-fa57b1bc) | DE | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 107 | [Phillips-Universität Marburg](/university/phillips-universitat-marburg-216baefb) | DE | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 108 | [Sungkyunkwan University](/university/sungkyunkwan-university-dba5fd6f) | KR | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 109 | [Pohang University of Science and Technology](/university/pohang-university-of-science-and-technology-bfa7cdcc) | KR | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 110 | [Hanyang University](/university/hanyang-university-4905a534) | KR | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 111 | [Sejong University](/university/sejong-university-51820d13) | KR | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 112 | [Pusan National University](/university/pusan-national-university-2816fd44) | KR | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 113 | [University of Ulsan](/university/university-of-ulsan-e35bbbf8) | KR | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 114 | [Chungbuk National University](/university/chungbuk-national-university-f069dcf3) | KR | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 115 | [University of Seoul](/university/university-of-seoul-9a78fb5f) | KR | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 116 | [Seoul National University of Science and Technology](/university/seoul-national-university-of-science-and-technology-f7630121) | KR | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 117 | [Woosong University](/university/woosong-university-154701f8) | KR | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 118 | [Istanbul Technical University](/university/istanbul-technical-university-addc1a48) | TR | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 119 | [Koç University](/university/koc-university-1848c4c4) | TR | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 120 | [Middle East Technical University](/university/middle-east-technical-university-be141d50) | TR | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 121 | [Boğaziçi University](/university/bogazici-university-e847d6a1) | TR | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 122 | [Sabanci University](/university/sabanci-university-b99788a4) | TR | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 123 | [Bilkent University](/university/bilkent-university-6ba258c1) | TR | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 124 | [Hacettepe University](/university/hacettepe-university-02d798aa) | TR | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 125 | [Bahçeşehir University](/university/bahcesehir-university-6f0c60bd) | TR | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 126 | [Istinye University](/university/istinye-university-57e342f6) | TR | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 127 | [Tobb Economics and Technology University](/university/tobb-economics-and-technology-university-4c76e35e) | TR | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 128 | [Beykent University](/university/beykent-university-7378b152) | TR | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 129 | [Gaziosmanpasa University](/university/gaziosmanpasa-university-16228b97) | TR | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 130 | [Kütahya Dumlupınar Üniversitesi](/university/kutahya-dumlupnar-universitesi-33db8963) | TR | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 131 | [Trakya University](/university/trakya-university-f88ac902) | TR | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 132 | [Universiti Putra Malaysia](/university/universiti-putra-malaysia-cf17178b) | MY | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 133 | [UCSI University](/university/ucsi-university-ec736339) | MY | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 134 | [Multimedia University](/university/multimedia-university-111f9e35) | MY | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 135 | [University of Science and Technology of China](/university/university-of-science-and-technology-of-china-5f90631a) | CN | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 136 | [Tongji University](/university/tongji-university-98208ca6) | CN | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 137 | [Fujian Medical University](/university/fujian-medical-university-5e721b6a) | CN | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 138 | [Nantong University](/university/nantong-university-38a2e7d1) | CN | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 139 | [Eastern Institute of Technology, Ningbo](/university/eastern-institute-of-technology-ningbo-85f3ec1b) | CN | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 140 | [Wuhan University of Science and Technology](/university/wuhan-university-of-science-and-technology-df57be8f) | CN | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 141 | [Jimei University](/university/jimei-university-51966b00) | CN | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 142 | [Nagoya University](/university/nagoya-university-ee15105c) | JP | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 143 | [Osaka Metropolitan University](/university/osaka-metropolitan-university-82bd6253) | JP | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 144 | [Tokyo Metropolitan University](/university/tokyo-metropolitan-university-83d3b96c) | JP | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 145 | [Tokyo University of Marine Science and Technology](/university/tokyo-university-of-marine-science-and-technology-46c3478f) | JP | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 146 | [Polytechnic Institute of Milan](/university/polytechnic-institute-of-milan-414b011a) | IT | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 147 | [University of Roma "La Sapienza"](/university/university-of-roma-la-sapienza-21e26f0d) | IT | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 148 | [University of Bologna](/university/university-of-bologna-a75ede9d) | IT | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 149 | [School of Education Pisa](/university/school-of-education-pisa-56162036) | IT | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 150 | [University of Padua](/university/university-of-padua-82ab247b) | IT | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 151 | [Humanitas University](/university/humanitas-university-4dbf274a) | IT | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 152 | [Free University of Bozen](/university/free-university-of-bozen-9bab4e8c) | IT | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 153 | [University of Palermo](/university/university-of-palermo-a97fb7f1) | IT | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 154 | [University of Parma](/university/university-of-parma-cf1fa9f3) | IT | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 155 | [Università degli Studi di Enna Kore](/university/universita-degli-studi-di-enna-kore-b79365ba) | IT | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 156 | [Semmelweis University](/university/semmelweis-university-ff45677f) | HU | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 157 | [Eötvös Lorand University](/university/eotvos-lorand-university-e8101d3e) | HU | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 158 | [University of Szeged](/university/university-of-szeged-d7169481) | HU | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 159 | [University of Debrecen](/university/university-of-debrecen-d5afae3a) | HU | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 160 | [Budapest University of Technology and Economics](/university/budapest-university-of-technology-and-economics-0221853f) | HU | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 161 | [Széchenyi István University](/university/szechenyi-istvan-university-27f0c8fe) | HU | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 162 | [Magyar Agrár- és Élettudományi Egyetem](/university/magyar-agrar-es-elettudomanyi-egyetem-81e23afe) | HU | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 163 | [Pázmány Péter Catholic University](/university/pazmany-peter-catholic-university-6e598028) | HU | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 164 | [University of Warsaw](/university/university-of-warsaw-29507709) | PL | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 165 | [Jagiellonian University Cracow](/university/jagiellonian-university-cracow-549fb70d) | PL | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 166 | [Wroclaw Medical University](/university/wroclaw-medical-university-bbd75936) | PL | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 167 | [Warsaw University of Technology](/university/warsaw-university-of-technology-336148d3) | PL | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 168 | [University of Gdańsk](/university/university-of-gdansk-ab274e65) | PL | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 169 | [University of Lodz](/university/university-of-lodz-55edea5b) | PL | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 170 | [Uniwersytet SWPS](/university/uniwersytet-swps-cb295ebf) | PL | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 171 | [University of Life Sciences in Lublin](/university/university-of-life-sciences-in-lublin-f2157398) | PL | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 172 | [Charles University Prague](/university/charles-university-prague-44fc5710) | CZ | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 173 | [Masaryk University](/university/masaryk-university-f388a529) | CZ | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 174 | [Czech Technical University of Prague](/university/czech-technical-university-of-prague-9e3df1a7) | CZ | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 175 | [Prague Institute of Chemical Technology](/university/prague-institute-of-chemical-technology-a87ee0e1) | CZ | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 176 | [University of Hradec Králové](/university/university-of-hradec-kralove-e08b2116) | CZ | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 177 | [University of Ostrava](/university/university-of-ostrava-0df615b9) | CZ | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 178 | [University of Alberta](/university/university-of-alberta-74effccc) | CA | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 179 | [York University](/university/york-university-03761e91) | CA | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 180 | [Lomonosov Moscow State University](/university/lomonosov-moscow-state-university-39a0a410) | RU | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 181 | [Bauman Moscow State Technical University](/university/bauman-moscow-state-technical-university-0991bacc) | RU | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 182 | [Moscow Institute of Physics and Technology](/university/moscow-institute-of-physics-and-technology-2b0bdfdf) | RU | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 183 | [Peoples' Friendship University of Russia](/university/peoples-friendship-university-of-russia-1e616477) | RU | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 184 | [St. Petersburg State University](/university/st-petersburg-state-university-d827b4d9) | RU | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 185 | [Ural Federal University](/university/ural-federal-university-9d5b6d21) | RU | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 186 | [N. I. Lobachevsky State University of Nizhny Novgorod](/university/n-i-lobachevsky-state-university-of-nizhny-novgorod-6e6859a3) | RU | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 187 | [MIREA - Russian Technological University](/university/mirea-russian-technological-university-87920010) | RU | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 188 | [Omsk State Technical University](/university/omsk-state-technical-university-99bb5a9f) | RU | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 189 | [Tula State University](/university/tula-state-university-9eafdb74) | RU | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 190 | [Khalifa University of Science, Technology and Research](/university/khalifa-university-of-science-technology-and-research-9d02e057) | AE | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 191 | [Abu Dhabi University](/university/abu-dhabi-university-0949633f) | AE | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 192 | [United Arab Emirates University](/university/united-arab-emirates-university-b544b3bb) | AE | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 193 | [University of Sharjah](/university/university-of-sharjah-9e6e1d4a) | AE | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 194 | [Singapore Management University](/university/singapore-management-university-5c15139b) | SG | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 195 | [Hong Kong Metropolitan University](/university/hong-kong-metropolitan-university-bd88f517) | HK | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 196 | [Turin Polytechnic University In Tashkent](/university/turin-polytechnic-university-in-tashkent-9485c68f) | UZ | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 197 | [Ajou University in Tashkent](/university/ajou-university-in-tashkent-64e76836) | UZ | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 198 | [British Management University in Tashkent](/university/british-management-university-in-tashkent-8b58712b) | UZ | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 199 | [Russian Economic University after G.V. Plekhanov](/university/russian-economic-university-after-g-v-plekhanov-4c6c3693) | UZ | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 200 | [Kazakh German University](/university/kazakh-german-university-1864081c) | KZ | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 201 | [Kyrgyz-Türkish Manas Üniversity](/university/kyrgyz-turkish-manas-university-ece36c8b) | KG | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 202 | [Kyrgyz Russian Slavic University](/university/kyrgyz-russian-slavic-university-be81cb5c) | KG | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 203 | [Moscow State University](/university/moscow-state-university-85061c78) | TJ | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |
| 204 | [Russian-Tajik Slavonic University](/university/russian-tajik-slavonic-university-b34c4f2c) | TJ | 2 | no (tuition, english_minimum, deadline, admissions_link) | — | — | — | — | — | — | — | — | — | ✔ current |  |

## Spot check against the profile page

Not recorded yet.

## Limits of this measurement

- "Current" depends on stored period labels. Most requirement rows, English minimums, briefs and linked aid carry no stated year, so they count as sourced but not current even when the official page may still be valid.
- A lone year in a scope text (for example "2026 instructions") is read as that intake year; range and "YYYY entry" forms take precedence.
- US tuition comes mostly from IPEDS 2023–24 out-of-state rates. They count as tuition with currency and year, but are not verified international prices and are never current.
- English minimums include programme-specific values (e.g. one WIUT course); the profile headline only shows university-wide ones.
- "International students page" is detected only by "international/overseas/non-local/foreign" in stored official link URLs or labels; there is no dedicated field, so the count is a floor.
- The target list ranks by world rankings as a proxy for where this segment applies; it is a draft for owner review.
