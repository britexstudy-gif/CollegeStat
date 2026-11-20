# OnePrep "College" section — research notes (2026-11-15)

Source: public pages on oneprep.com (oneprep.xyz now 308-redirects there), read through
their published `llms.txt`, `sitemap.xml` and the Markdown representations they offer to
agents. Pages behind sign-in (Chance Me, saved list, application plan) were not opened;
what they do is taken from public marketing copy on `/college` and `/college-tools/college-list`.
Ideas only — no branding, copy or assets are reused.

## What the section contains

| Area | Public URL pattern | What it shows |
| --- | --- | --- |
| College finder | `/college-finder` (+ ~100 SEO filter pages: `/public`, `/sat-1200`, `/ranking-qs`, `/acceptance-rate-above-70`) | Search box; filters for school type, state, acceptance-rate slider (0–100 %), median-SAT slider (400–1600); sort by ranking. Each result card: rank number, name, city, **acceptance rate**, **median SAT**, school type, and a "Save to my list" button. |
| College profile | `/university/<slug>` | One-paragraph summary (type, city, enrolment, acceptance, graduation rate). Two CTAs: "Ask the AI about this college for my list" and "See my chances". Then blocks: admissions outcomes (acceptance %, a split of enrolled / admitted-not-enrolled / not admitted, single year vs past years), **typical test scores (SAT and ACT middle 50 %)**, ranking over time, popular majors (% bars), student body, a **scatter of applicant SAT × GPA with "You" plotted** and two fields "Your GPA / Your SAT", an "At a glance" list (location, acceptance, enrolment, graduation, founded, median salary), rankings from 4 publishers, contact + virtual tour + socials, campus photo with licence credit, FAQ (acceptance, test policy, cost, aid, % international, graduation). Every FAQ answer says plainly when a figure is not reported. |
| Admissions outcomes | `/university/<slug>/admissions-outcomes` | Scatter chart (SAT vs unweighted GPA) of self-reported applicants coloured admitted / waitlisted / rejected, with the viewer's own point. |
| Essay prompts | `/university/<slug>/essay-prompts` | Prompts for the current cycle grouped by programme, each with cycle label ("2026/2027"), word limit, Required / "Choose 1 of 2" tags. |
| Essay examples | `/university/<slug>/essays` | Redacted excerpts of admitted students' essays, with the prompt and word count. |
| Admitted students | `/university/<slug>/admitted-students`, `/profiles/...` | Public applicant profiles: schools admitted to, stats, activities. |
| Resources hub | `/university/<slug>/resources` | Cards linking all of the above plus generic tools: college list builder, activities grader, recommendation-letter request helper. |
| Groups | `/university/groups/ivy-league`, `top-20`, `russell-group`, `uc`, `ucas` | Curated sets of colleges. |
| College list | `/college-tools/college-list` | Three columns **Reach / Target / Safety** with counts, then a **side-by-side comparison table** (acceptance rate, annual tuition, enrolment, ranking). |
| Chance Me (signed-in) | `/chanceme/...` | One saved profile (grades, test scores, goals) → per-college chance %, labelled Reach / Target / Likely. |
| Application plan (signed-in) | marketing copy on `/college` | Per-application checklist ("6 of 9 complete": personal statement, activities, recommendation, final review) with deadlines and next steps. |
| Blog per college | `/blog/<college>-application-deadlines`, `...-acceptance-rate-gpa-sat-act` | Deadlines (ED/EA/RD/rolling) and score articles per college, for SEO. |

## UI patterns worth taking

1. **Stat-first header.** Name + city, then 3–6 numbers before any prose (acceptance, SAT middle 50 %, enrolment, graduation, tuition).
2. **"You vs admitted" in place.** The profile page asks for (or reads) your score and plots you against the admitted range — no separate tool needed.
3. **One profile, many colleges.** Scores are entered once; every page and the list reuse them to label Reach / Target / Likely.
4. **List grouped by fit.** Three columns, with counts, instead of one flat list; comparison table underneath.
5. **Per-application progress.** "6 of 9 complete" with named requirements and the next deadline.
6. **Honest gaps.** Missing figures say "not reported — check the official site" instead of showing blanks or zeros.
7. **Prompt cards.** Cycle label, word limit and Required / Optional tag at the top of each essay prompt.
8. **Calm, monochrome surfaces** with one accent; numbers large, labels small and muted.

## What CollegeStat already has

Media/logos/video per university, rankings badges, admissions tab with deadlines and requirements,
costs, scholarships, compare, saved universities with application status
(Researching → Considering → Applying → Submitted → decision), private notes, a checklist,
research lists, admission + application simulators, AI assistant, practice and writing desk.

## What CollegeStat lacks (and what this round adds)

| Gap | This round |
| --- | --- |
| At-a-glance stat strip on the university page (acceptance, SAT/ACT middle 50 %, IELTS/TOEFL, intl tuition, next deadline) | Added |
| "Your scores vs admitted range" bar on the university page | Added (reads the signed-in profile) |
| Cost breakdown (tuition, living, total, after typical aid) in one block | Added |
| Deadlines as a timeline (ED / EA / RD / UCAS / national rounds) | Added |
| Application requirements as a checklist | Added |
| Supplemental essay prompts per university | Shown when the record has them (few do — see data gaps) |
| Reach / Target / Safety on the list, with requirement progress and next deadline | Added to My colleges |
| "Add to my list" with a fit choice from the university page | Added |
| Admitted-applicant scatter, essay examples, public admitted profiles | Not built — needs user-contributed data we do not have |
| Side-by-side comparison under the list | Already exists as /compare; linked from My colleges |
