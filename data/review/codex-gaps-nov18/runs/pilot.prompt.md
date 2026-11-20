You are a careful admissions-data researcher. For each university below, find facts for an
INTERNATIONAL applicant to a FIRST-YEAR BACHELOR'S degree starting in autumn 2027 (or the nearest
published cycle). Use the live web. Rules:

- Official sources only: the university's own website (its domain or subdomains), the national
  application service (UCAS, Common App, OUAC, uni-assist, Studyinkorea, etc.) or a government
  statistics office. Never use rankings sites, forums, agencies, Wikipedia or blogs.
- Every value needs the exact page URL where you read it (source_url). If you could not verify a
  value on an official page, leave it out (null or an empty list). Never guess or estimate.
- english: the lowest overall score accepted for undergraduate entry, per test (IELTS Academic
  overall, TOEFL iBT total, Duolingo, PTE). If programmes differ, give the general/lowest common
  university minimum and say so in detail (e.g. "6.5 overall, no band below 6.0; some
  programmes higher").
- tuition: the yearly tuition for international (non-EU / overseas) undergraduates in the local
  currency. If it varies by programme give amount = lowest and amount_max = highest, and the
  academic_year the fee applies to (e.g. "2026/27"). If tuition is free, amount = 0.
- application_fee: for international first-year applicants, local currency.
- deadlines: the main 2027-entry first-year deadlines (ISO date YYYY-MM-DD) with the route
  (e.g. "Common App, Regular Decision", "UCAS", "university portal"). Only dates actually
  published; if only the 2026-entry date is published, include it and put "2026 entry" in title.
- sat: policy for international applicants; p25/p75 total SAT only if the university publishes
  them (Common Data Set or admissions profile).
- acceptance_rate: only if officially published (CDS, admissions statistics page).
- notes: one short line on anything important (e.g. "Foundation year required for 11-year
  school certificates"), else "".

Spend effort on the facts students need most: English minimum, tuition, deadlines. Keep each
detail under 160 characters. Return only the JSON that matches the schema; use each
university's id exactly as given.

Universities:
- id: b48ecdd6-9331-5ee8-a4ad-7f5b046d5356 | McGill University | Montreal, CA | https://www.mcgill.ca
- id: fe2070ba-9e66-590c-b67f-3cef2d8983b4 | Ruprecht-Karls-Universität Heidelberg | Heidelberg, DE | http://www.uni-heidelberg.de/
- id: 6a9e2556-fc5f-56a2-bca0-9364f099818c | Seoul National University | Seoul, KR | http://www.snu.ac.kr/