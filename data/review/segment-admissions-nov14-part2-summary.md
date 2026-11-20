# Admissions research, segment part 2

Checked **2026-11-14**. Researched targets.json indexes **55–104 (50 universities)** in target-file order. All rows are marked `staged`; unknown fields remain `null`. Sources are official university admissions, international office, tuition, and scholarship pages or official guides. Dates and fees are labelled with the latest published cycle when available.

## Field fill rates

| Field | Filled | Rate |
|---|---:|---:|
| IELTS Academic | 19/50 | 38% |
| TOEFL iBT | 16/50 | 32% |
| Duolingo | 1/50 | 2% |
| English waivers / alternatives | 22/50 | 44% |
| Application route | 46/50 | 92% |
| Application fee | 13/50 | 26% |
| Deadlines | 34/50 | 68% |
| International tuition | 31/50 | 62% |
| International aid | 30/50 | 60% |
| Explicit Central Asian / CIS scholarship | 0/50 | 0% |
| Foundation / preparatory route for 11-year schooling | 26/50 | 52% |

## Notable gaps

- No reviewed official page explicitly named a scholarship open specifically to Central Asian or CIS students. This field is left null throughout rather than inferring eligibility from broad international awards.
- Universities often set language scores, fees, and entry requirements by programme. A general university-wide IELTS or TOEFL threshold could not be established for many targets.
- Application fees and 2027 dates were less consistently published than routes and tuition. Several Chinese universities had only 2026 undergraduate guides available; those records identify the cycle year.
- Tuition is commonly programme-specific. Values are recorded as ranges or examples only where the official schedule supports them; otherwise they remain null.
