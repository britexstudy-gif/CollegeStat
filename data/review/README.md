# Review queue candidates

Files here are **not** loaded by the app and are never published automatically. Each batch folder holds facts collected from official university websites, with the exact source page and a short quote, waiting for staff review.

| File | What it holds | Where it goes after review |
| --- | --- | --- |
| `observations.json` | International undergraduate tuition (`metric: "tuition"`, unit is the ISO currency, year is the academic-year start) | `npm run ingest:review -- --file … --source <uuid> --apply` stages it with `stage_observations`; staff approve each row in Admin → Review |
| `requirements.json` | IELTS / TOEFL undergraduate minimums, `verification_status: "needs_review"` | Requirements, after checking the quote on the source page |
| `deadlines.json` | Undergraduate application deadlines for the 2027 cycle | Application dates, after confirming the cutoff time |
| `institution-types.json` | Public / private status quoted from an official page | University record |
| `rejected.json` | Every collected item the validator refused, with the reason | Nothing; kept for audit |
| `summary.json` | Counts and the universities not yet returned | — |

Validation (`npm run ingest:review:check -- --input <collector dir> --targets <targets.json>`) requires an official-domain or government HTTPS source, a quote that contains the reported number, a known currency, an annual figure for 2025–2027, test scores in range, and deadlines inside the 2027 cycle. Collector quotes can come from a summarised page fetch, so reviewers should confirm the wording and the applicant group (international vs. EU/home, programme) on the live page before approving.

Staging uses a signed-in staff access token (`STAFF_ACCESS_TOKEN`), never the service-role key, so the existing admin checks and audit logs apply.
