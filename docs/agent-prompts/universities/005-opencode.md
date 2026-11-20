# Public university research: Harvard University

Task 005 · provider OpenCode · review date 2026-10-16
University ID: 39230496-b2fc-53ca-9303-1726c4ac13da
Official university website: http://www.harvard.edu/
Scope: academics_admissions_costs_rankings

Research only this institution, using public official university pages and the ranking publisher's own pages. Inspect pages rather than guessing URLs or relying on memory. You are working in a temporary public research folder. Never read a repository, parent directories, environment variables, credentials, personal files, accounts or private student profiles. Do not change settings, submit forms, send messages, run SQL, publish or import anything. Do not write files. Emit the complete `report.json` object in your final response so the launcher can save it.

Find accurate evidence for:

1. Official academic catalogue and subject/programme directory. Record the complete-directory URL; list verified programme names, subject area, undergraduate/postgraduate level and campus only where explicitly stated. A sample must be labelled a sample, never a complete list.
2. Admissions route and next published entry cycle; programme/country/qualification-specific entry requirements, required subjects, English tests, exemptions and application deadlines. Do not promote one programme's requirements to the whole university.
3. Applicant and admitted/enrolled counts. Preserve year, degree level, campus and cohort. Never infer an acceptance rate from different populations or identify private applicants.
4. Tuition, mandatory fees, accommodation/living-cost estimates and aid. Preserve currency, academic year, residency/international status, programme, annual/term/whole-course unit and whether estimates include housing. Distinguish published cost from net cost after aid.
5. University-wide ranking positions from uniRank, Webometrics, QS, THE, ARWU, CWUR or a relevant official national publisher. Preserve exact publisher, edition/year, region/world/national scope, rank/band/tie and source URL. Do not substitute research-only citation metrics for a university ranking. If a source cannot be read, record it as missing; never invent a place or borrow another edition.

Work for at most three minutes. Aim for 5–8 inspected primary sources and a useful partial report rather than invented completeness. Prioritize the programme directory, entry requirements, cost page and one university ranking; record unverified categories in missing. Every fact must have an inspected source URL, reporting year or null, retrieval date, precise population/scope and a brief paraphrase of supporting evidence. No article bodies, large quotations, scraped image binaries or protected datasets. Ranking redistribution permission is unknown unless explicit terms say otherwise. All output remains a candidate pending a separate native review.

Return this JSON shape with actual values; do not repeat this example as your answer:

```json
{
  "schemaVersion": 1,
  "universityId": "39230496-b2fc-53ca-9303-1726c4ac13da",
  "university": "Harvard University",
  "provider": "opencode",
  "scope": "academics_admissions_costs_rankings",
  "checkedAt": "2026-10-16",
  "reviewState": "pending_native_review",
  "facts": [
    {
      "field": "program_directory",
      "value": "A verified fact or structured value",
      "sourceUrl": "https://official.example.edu/exact-page",
      "sourceTitle": "Actual page title",
      "publisher": "Actual publisher",
      "sourceYear": null,
      "retrievedAt": "2026-10-16",
      "population": "Exact level, campus, programme, applicant category or edition",
      "evidence": "Short paraphrase of the inspected evidence",
      "reuse": "metadata_link_only"
    }
  ],
  "missing": [{"field": "unverified_field", "reason": "Specific evidence gap"}],
  "conflicts": []
}
```

Allowed fact fields: program_directory, subject_directory, programme, entry_requirement, required_subject, language_requirement, language_exemption, application_route, application_cycle, deadline, applicant_count, admitted_count, enrolled_count, tuition, mandatory_fee, living_cost, accommodation_cost, scholarship, financial_aid, ranking.
Finish with `RESEARCH_COMPLETE` after emitting the complete final JSON. Do not request permission to save a file; the launcher handles saving.
