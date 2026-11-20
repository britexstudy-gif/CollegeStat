# Admissions research segment, part 4

Scope: `targets.json` university indexes 155–203 (0-based), in target-file order; 49 universities. Each record is staged and has checked date 2026-11-14. Sources are official university-owned pages. Official admissions, international, fees, scholarship and programme pages were fetched in focused batches, with no more than six concurrent requests. Unknown details remain null.

## Field fill rates

- English test/waiver information: 26/49 (53.1%)
- Application route and/or fee: 43/49 (87.8%)
- Cycle-labelled deadline information: 26/49 (53.1%)
- Annual tuition information: 23/49 (46.9%)
- International aid / scholarship information: 34/49 (69.4%)
- Foundation / preparatory-year information: 16/49 (32.7%)

Fill rate means the field has a non-null researched value; some values are partial (for example, an application route is known but the application fee is not, or the tuition page gives programme-specific rates).

## Notable gaps

- Russian/Central Asian institutions often publish admissions rules in Russian or only for the latest 2026/27 cycle. English test scores are frequently not specified for Russian-taught programmes; routes, entrance exams and budget-place eligibility are more commonly published.
- Tuition is programme-specific at many institutions. Some pages provide a total cost including housing/meals, domestic prices, undated prices, or semester-only fees rather than a separable annual international rate; these are qualified or left null.
- Some application deadlines vary by programme, applicant category, qualification or visa status; 2027 dates are not published for all universities. Older available dates are explicitly labelled by cycle.
- Foundation-year evidence is limited. Some institutions provide a pre-university Russian course or a preparatory programme, which is identified as such; this is not always expressly tied to an 11-year certificate.
- Explicit Central Asian/CIS eligibility was confirmed for AUCA and KBTU financial aid, CUHK’s Belt and Road Scholarship (including Kazakhstan), and UCA full scholarships for students from Kyrgyzstan, Kazakhstan and Tajikistan.
