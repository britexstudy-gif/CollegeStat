# Data schema

Derived from `scripts/data-ops/model.ts` (zod models). If they differ, the code wins; regenerate this file when the model changes.

One record per university, one JSON object per line in `data/curated/universities.ndjson`.

## Record

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | Stable id |
| `slug` | string or null | URL slug |
| `name` | string | |
| `country_code` | string or null | ISO 3166-1 alpha-2 |
| `website` | string or null | Official site |
| `facts` | map field name to fact | Current view: one resolved fact per field, latest academic year only |
| `alternatives` | map field name to list of facts | Tied/conflicting candidates kept next to the chosen fact |
| `aliases`, `merged_ids`, `collectors` | string lists | Other names, merged duplicates, which collectors contributed |

Internal fields (`is_target`, `target_rank`) are product-specific and are not part of the open export.

## Fact (provenance on every value)

| Field | Type | Notes |
|---|---|---|
| `value` | per field, below | |
| `source_url` | http(s) URL | Required |
| `retrieved_at` | `YYYY-MM-DD` | When the source was read |
| `method` | `fetched`, `snippet`, `dataset` | |
| `collector` | string | Who or what collected it |
| `confidence` | 0..1 | |
| `verified` | boolean | Human-checked |
| `academic_year` | `YYYY/YY` or null | e.g. `2026/27` |
| `flags` | string list | Automatic warnings |
| `note` | string or null | |

## Freshness rule

Only 2026/27 (preferred) or 2025/26 values appear in the current view. Older values are history only. Applies to all year fields; `founded_year` has no year.

## Field values

`money` = non-negative number. `Currency` = 3-letter ISO code.

- `tuition`: `amount`, `range_min`, `range_max` (money or null), `currency`, `period` (year, semester, credit, month, total), `usd` (annual USD or null), `fx` ({usd_per_unit, date, source} or null), `basis`
- `mandatory_fees`, `living_cost`, `application_fee`, `cost_of_attendance`, `net_price`, `median_earnings_10y`: `amount`, `currency`, `usd`, `text` (all nullable)
- `deadlines`: list of {`round`, `label`, `date` (or null), `date_inferred`, `text`, `intake_year`, `source_url`, `retrieved_at`, `method`, `collector`}. Rounds: early_action, restrictive_early_action, early_decision, early_decision_2, regular, priority, rolling, first_round, second_round, third_round, scholarship, document, open, close, other
- `platform`: {`code`, `label`}. Codes: common_app, ucas, coalition, direct, national_portal, studielink, uni_assist, universitaly, other
- `ielts`: `status` (required, optional, not_required, conditional, unknown), `overall`, `component`, `text`
- `toefl`: `status`, `ibt` (0-120), `ibt_component`, `band_2026` (1-6 scale), `text`
- `duolingo`: `status`, `minimum`, `text`
- `sat_act`: `policy` (required, optional, not_considered, recommended, unknown), `text`
- `acceptance_rate`: `percent` (0-100), `year`
- `documents`: list of strings
- `programmes`: list of {`name`, `faculty`, `degree`, `years`, `requires`, `source_url`}
- `founded_year`: integer 800..2035
- `student_count`, `undergrads`: {`value`, `year`}
- `sat_scores`: `reading_25`, `reading_75`, `math_25`, `math_75`, `average` (nullable)
- `act_scores`: `p25`, `p75`
- `international_share`, `grad_rate`: fraction 0..1
- `bachelor_fields`: list of strings

`documents`, `programmes`, `bachelor_fields` are unions across sources; every other field has one winner.

US-only fields (`sat_scores`, `act_scores`, `cost_of_attendance`, `net_price`, `undergrads`, `international_share`, `grad_rate`, `median_earnings_10y`, `bachelor_fields`) come from IPEDS / College Scorecard (US public domain).

## Hard check errors (`npm run data:check`)

Schema mismatch, value out of range, missing source, a pre-2025/26 value in the current view.
