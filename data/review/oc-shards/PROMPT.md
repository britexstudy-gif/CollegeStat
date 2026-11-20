# Data collection task (CollegeStat)

You collect OFFICIAL admissions data for international (non-US-citizen) first-year bachelor's applicants from Central Asia, 2027 intake.

Input: `data/review/oc-shards/input-N.json` (N given in the run message): a list of universities {id, slug, name, country_code, website, qs_rank}.
Output: `data/review/oc-shards/output-N.json` — a JSON object `{ "generated": "<date>", "records": [ ... ] }`, one record per input university, in the SAME shape as the example below. Write/update this file after every 5 universities so progress is never lost. If the file already exists, keep its records and continue with the missing universities.

For each university find, from the university's OWN official pages (or official UCAS / Common App / uni-assist / government pages):
- tuition: international undergraduate tuition per year for 2026/27 (or latest published), currency, USD conversion (state rate + date), mandatory fees, living cost if published.
- deadlines: application rounds and dates for the 2027 intake (ED/EA/RD; UCAS 15 Jan / 15 Oct; uni-assist; national rounds).
- platform: Common App / Coalition / UCAS / uni-assist / direct portal / Studielink / etc.
- english: IELTS overall (+ minimum band), TOEFL iBT, Duolingo.
- sat_act: required / optional / not used, middle-50% if published.
- acceptance_rate if officially published (+ year).
- documents: required documents for international applicants (diploma, transcripts, translations, passport, recommendation letters, essays, portfolio, interview).
- programmes: up to 15 English-taught bachelor's programmes: name, faculty, duration, and one plain-English sentence on what it requires (e.g. "A-level Maths A*, interview").

Rules:
- Every field gets `source_url` and `retrieved_at` (YYYY-MM-DD). Prefer pages you actually fetched; if you only saw a search snippet, set `"method": "search snippet - verify"`.
- NEVER guess. Unknown → `null` with a short note.
- Do not bypass bot protection (403 / captcha → skip that page, note it).
- Only write the output file. Do not edit any other file in the project.

Example record shape:
```json
{
  "id": "…", "slug": "…", "name": "…", "country_code": "GB",
  "tuition": {"amount": 29500, "currency": "GBP", "academic_year": "2026/27", "usd": 37400, "fx_rate_usd_per_unit": 1.268, "fx_date": "2026-11-16", "mandatory_fees": null, "living_cost": {"value": "£1,300/month estimate"}, "source_url": "…", "retrieved_at": "2026-11-16"},
  "deadlines": {"value": [{"round": "UCAS equal consideration", "date": "2027-01-14", "cycle": "2027 entry"}], "source_url": "…", "retrieved_at": "…"},
  "platform": {"value": "UCAS", "source_url": "…", "retrieved_at": "…"},
  "english": {"ielts": "6.5 overall, 6.0 each", "toefl_ibt": "92", "duolingo": "120", "source_url": "…", "retrieved_at": "…"},
  "sat_act": {"value": "Not used", "source_url": "…", "retrieved_at": "…"},
  "acceptance_rate": {"value": null, "note": "not published"},
  "documents": {"value": ["…"], "source_url": "…", "retrieved_at": "…"},
  "programmes": {"value": [{"name": "BSc Computer Science", "faculty": "…", "years": 3, "requires": "…"}], "source_url": "…", "retrieved_at": "…"},
  "notes": []
}
```
When all universities are done, print a one-line coverage summary (how many have tuition, deadlines, platform, IELTS, programmes).
