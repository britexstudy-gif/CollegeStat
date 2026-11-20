# Article collection — 15 October 2026

The active library contains 14 genuine articles from five university publishers. Every card opens the complete original article on the publisher's own website. CollegeStat-authored briefs, summaries, checklists, read-time estimates, generated article artwork and campus-photo article substitutes have been removed from the active library. No third-party article body or publisher photography is copied.

Cards show the original title, publisher, byline and a publication date only when a complete date was verified. The collection review date is not displayed as an article publication date. Article search combines topics with title, publisher, author or country-code queries. Both the public collection and the dashboard library use the same records.

## Sources

The records below were inspected on 15 October 2026. Their primary-source URLs and review methods are retained in `data/published/external-articles-oct15.json`.

| Article | Original publisher | Verified publication date |
| --- | --- | --- |
| [How To Write A College Essay](https://mitadmissions.org/blogs/entry/how-to-write-a-college-essay/) | MIT Admissions · Chris Peterson SM '13 | 30 July 2012 |
| [Applying Sideways](https://mitadmissions.org/blogs/entry/applying_sideways/) | MIT Admissions · Chris Peterson SM '13 | 1 November 2010 |
| [applying sideways, beyond admissions](https://mitadmissions.org/blogs/entry/applying-sideways-beyond-admissions/) | MIT Admissions · Veronica M. '22 | 22 April 2021 |
| [Entering Senior Year: What I Wish I Knew as a First-Year](https://college.harvard.edu/student-life/student-stories/entering-senior-year-what-i-wish-i-knew-first-year) | Harvard College Student Voices · Daisy, Class of '27 | 2 September 2026 |
| [Choosing Harvard](https://college.harvard.edu/student-life/student-stories/choosing-harvard) | Harvard College Student Voices · Maria | 20 February 2020 |
| [Don't Worry, You're Going to Be Just Fine](https://college.harvard.edu/student-life/student-stories/dont-worry-youre-going-be-just-fine) | Harvard College Student Voices · Elizabeth, Class of '28 | 23 June 2026 |
| [How Studying Abroad Influenced My Career Goals](https://college.harvard.edu/student-life/student-stories/how-studying-abroad-influenced-my-career-goals) | Harvard College Student Voices · Daisy, Class of '27 | 6 October 2026 |
| [5 Essay Writing Tips to Get You Through December](https://admissions.tufts.edu/blogs/inside-admissions/post/5-essay-writing-tips-to-get-you-through-december/) | Tufts Inside Admissions · Sean Ashburn | Not shown; no complete date verified |
| [For Juniors: Beginning Your College Search](https://admissions.tufts.edu/blogs/inside-admissions/post/for-juniors-beginning-your-college-search/) | Tufts Inside Admissions · Isabelle Charles | Not shown; no complete date verified |
| [Applying to College: The Jumbo in the Room](https://admissions.tufts.edu/blogs/inside-admissions/post/applying-to-college-the-jumbo-in-the-room/) | Tufts Inside Admissions · Abigail Pingpank | Not shown; no complete date verified |
| [How to choose a career](https://uwaterloo.ca/future-students/missing-manual/careers/how-to-choose-a-career) | University of Waterloo Missing Manual · Naomi (she/her), student | Not shown; no complete date verified |
| [How to Budget at University](https://blogs.bath.ac.uk/students/2024/01/24/how-to-budget-at-university/) | University of Bath Student bloggers · Tom Gravell | 24 January 2024 |
| [The Gold Scholarship Programme (GSP) and Me](https://blogs.bath.ac.uk/students/2023/06/20/the-gold-scholarship-programme-gsp-and-me/) | University of Bath Student bloggers · Gina Nkwah | 20 June 2023 |
| [My ultimate guide for an international student moving to the UK](https://blogs.bath.ac.uk/students/2021/05/06/my-ultimate-guide-of-moving-to-the-uk-as-an-international-student/) | University of Bath Student bloggers · Camille Kok | 6 May 2021 |

The original review of Choosing Harvard used the official-domain search-index article header/body because the direct fetch exceeded the tool's size limit. Other entries record direct original-publisher inspection. During integration the MIT essay, Harvard first-year, Bath budgeting and Tufts essay pages were reopened successfully; their visible titles and available bylines/dates match the catalogue.

## Retired readers

`/articles/[id]`, `/dashboard/library/articles/[id]` and `/dashboard/library/resources/[id]` redirect to the full original source. Unknown identifiers return 404. The old admission-guide slugs remain only as `{slug,title,provider,url}` redirect metadata in `official-admissions-sources.json`; their authored content and image fields have been removed. Useful application planning tools remain at `/resources` and `/dashboard/library/resources`.

The collection inherits the application's typeface and theme tokens, with no separate serif font or navy-blue dark-mode palette. It has three typographic featured cards, topic controls, search, a clear result count and empty-search recovery. No article images are rendered.

## Verification

24 scoped Node tests passed across `official-sources`, `resource-library-state-oct11` and `workspace-navigation`. These cover original-publisher metadata, no article bodies/images, bylines, unknown dates, combined filtering, all three real reader redirects including dashboard aliases, unknown-reader 404s, and existing owner-isolated application-planning state.

Final integrated typecheck, build and browser review are performed by the parent task. No deployment is claimed.
