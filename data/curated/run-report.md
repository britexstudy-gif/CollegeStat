# Curated data — merge run

As of 2026-11-16 (newest retrieved_at). Built by `scripts/data-ops/merge.ts`. Current view = newest value per field, academic year 2026/27 preferred, else 2025/26; older years are history only.

- Universities in the current view: **13887** (targets: 204/204)
- Hidden (excluded, reversible via `data/curated/overrides.json`): **116** — duplicate 24, no-bachelors 74, closed 18
- Conflicts: **92** — resolved 58 (fetched>snippet 3, newer-academic-year 41, verified-dataset>research 14), ties kept with both values 34
- Rejected values (dropped, university kept): **129**
- Observations that matched no catalogue university: 0

- Cross-source validation: warning tuition-jump 195, warning admit-gap 5, error impossible 4, warning sat-gap 1 (`validation.ndjson`)

## Inputs

| Adapter | Files | Observations | Rejected | Unmatched |
|---|---:|---:|---:|---:|
| oc-shards | 7 | 783 | 115 | 0 |
| targets-latest | 1 | 776 | 0 | 0 |
| nov14-merged | 1 | 410 | 0 | 0 |
| programmes-latest | 1 | 20 | 0 | 0 |
| programmes-costs-nov14 | 1 | 47 | 0 | 0 |
| published | 6 | 135 | 0 | 0 |
| scorecard | 1 | 21635 | 1 | 0 |
| us-history | 1 | 3469 | 1 | 0 |
| ipeds | 2 | 6755 | 3 | 0 |
| wikidata | 1 | 16273 | 1 | 0 |
| cds | 1 | 159 | 0 | 0 |
| cricos-duo | 1 | 118 | 0 | 0 |
| datasets-nov16b | 1 | 420 | 0 | 0 |

## Coverage of the 204 targets (current-year values)

| Field | Before (targets-latest only) | After merge |
|---|---:|---:|
| tuition | 119 | 142 |
| deadlines | 152 | 161 |
| platform | 178 | 195 |
| ielts | 139 | 143 |
| toefl | 85 | 91 |
| duolingo | 44 | 44 |
| sat_act | 16 | 16 |
| application_fee | 0 | 53 |
| acceptance_rate | 0 | 27 |
| documents | 3 | 26 |
| programmes | 0 | 35 |
| sat_scores | 0 | 21 |
| bachelor_fields | 0 | 28 |
| intl_aid | 0 | 1 |
| applicants | 0 | 23 |
| gpa_avg | 0 | 2 |
| c7_factors | 0 | 0 |
| room_board | 0 | 1 |
| intl_students | 0 | 0 |

## US (3466 current records)

| Field | Before (IPEDS ≤2023/24) | After (Scorecard 2025/26 + research) |
|---|---:|---:|
| tuition | 1859 | 2262 |
| acceptance_rate | 1673 | 1697 |
| sat_scores | 681 | 1027 |
| act_scores | 686 | 913 |

## Trust of target facts (confidence: verified ≥ 0.85 · likely ≥ 0.6 · check < 0.6)

| Field | verified | likely | check official site |
|---|---:|---:|---:|
| tuition | 85 | 2 | 55 |
| deadlines | 81 | 22 | 58 |
| platform | 152 | 0 | 43 |
| ielts | 63 | 1 | 79 |
| toefl | 51 | 1 | 39 |
| duolingo | 19 | 0 | 25 |
| sat_act | 2 | 0 | 14 |
| application_fee | 50 | 0 | 3 |
| acceptance_rate | 25 | 0 | 2 |
| documents | 21 | 0 | 5 |
| programmes | 35 | 0 | 0 |
| sat_scores | 21 | 0 | 0 |
| bachelor_fields | 28 | 0 | 0 |
| intl_aid | 1 | 0 | 0 |
| applicants | 23 | 0 | 0 |
| gpa_avg | 2 | 0 | 0 |
| room_board | 1 | 0 | 0 |

## Academic year of current values

- 2025/26: 21398
- 2026/27: 5795
- 2027/28: 78
- timeless: 11994

## Rejected values by reason

- missing-source: sat_act: 118
- missing-source: platform: 57
- missing-source: mandatory_fees: 9
- missing-source: deadlines: 8
- missing-source: tuition: 7
- range: acceptance_rate: 5
- missing-source: ielts: 4
- impossible: applicants: 4
- impossible: admitted: 4
- schema: deadlines: 3
- missing-source: toefl: 2
- missing-source: documents: 2
- missing-source: duolingo: 1
- schema: founded_year: 1

## History (kept, not shown)

- older academic year ; owner rule: latest only: 10249
- lost conflict: 58
- older intake ; newest is 2027: 6

## Excluded — spot check

| University | Country | Reason | Detail |
|---|---|---|---|
| Anna Maria College | US | closed | Scorecard UNITID 164492: CURROPER=0, PREDDEG=3, HIGHDEG=4 |
| Memphis Theological Seminary | US | closed | Scorecard UNITID 220871: CURROPER=0, PREDDEG=4, HIGHDEG=4 |
| Polytechnic University of Puerto Rico-Miami | US | closed | Scorecard UNITID 456481: CURROPER=0, PREDDEG=3, HIGHDEG=4 |
| Abilene Christian University | US | duplicate | merged into efcd0b52-6611-50e3-9ac7-d9831889822a (Abilene Christian University); shared ROR https://ror.org/004srrf86 |
| Indiana University-South Bend | US | duplicate | merged into 50759d76-f3b9-5218-8502-203e0d66c99d (Indiana University-South Bend); shared IPEDS unitid 151342 |
| Palm Beach State College | US | duplicate | merged into 20589910-87be-55c8-a2cf-2f32b701b433 (Palm Beach State College); shared IPEDS unitid 136358 |
| University of Houston | US | duplicate | merged into c73aa8d4-48b0-5ee4-b8a6-5b62bfa1ce65 (University of Houston); shared name + country + domain (uh.edu) |
| Advance Science International College | US | no-bachelors | Scorecard UNITID 444334: CURROPER=1, PREDDEG=2, HIGHDEG=2 |
| Bais Binyomin Academy | US | no-bachelors | Scorecard UNITID 128586: CURROPER=1, PREDDEG=2, HIGHDEG=2 |
| Cerritos College | US | no-bachelors | Scorecard UNITID 111887: CURROPER=1, PREDDEG=1, HIGHDEG=2 |
| College of the Canyons | US | no-bachelors | Scorecard UNITID 111461: CURROPER=1, PREDDEG=2, HIGHDEG=2 |
| Davis College | US | no-bachelors | Scorecard UNITID 202435: CURROPER=1, PREDDEG=1, HIGHDEG=2 |
| East Los Angeles College | US | no-bachelors | Scorecard UNITID 113856: CURROPER=1, PREDDEG=1, HIGHDEG=2 |
| Galen Health Institutes-Asheville | US | no-bachelors | Scorecard UNITID 498119: CURROPER=1, PREDDEG=2, HIGHDEG=2 |
| Guam Community College | US | no-bachelors | Scorecard UNITID 240745: CURROPER=1, PREDDEG=2, HIGHDEG=2 |
| Los Angeles Mission College | US | no-bachelors | Scorecard UNITID 117867: CURROPER=1, PREDDEG=2, HIGHDEG=2 |
| Nebraska Indian Community College | US | no-bachelors | Scorecard UNITID 181419: CURROPER=1, PREDDEG=2, HIGHDEG=2 |
| Phoenix College | US | no-bachelors | Scorecard UNITID 105428: CURROPER=1, PREDDEG=1, HIGHDEG=2 |
| San Diego Miramar College | US | no-bachelors | Scorecard UNITID 122384: CURROPER=1, PREDDEG=2, HIGHDEG=2 |
| Stark State College | US | no-bachelors | Scorecard UNITID 205841: CURROPER=1, PREDDEG=1, HIGHDEG=2 |
