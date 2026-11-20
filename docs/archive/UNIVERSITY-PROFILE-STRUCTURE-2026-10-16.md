# University profile structure

All university profiles share eight destinations: Overview, Apply, Study, Costs & funding, Rankings, Campus & media, People & stories, and Evidence. The overview offers six direct paths into the detailed profile, alongside the institution's location, type, founding year and official website. Empty fields remain unknown.

`lib/university-profile-structure.ts` is the shared field contract for collection and presentation. It covers courses and subjects; qualifications, language and duration; admissions routes, documents and deadlines; cohort-specific applicants/admitted/enrolled; tuition and living costs by year, currency and residency; funding; publisher-specific ranking positions; campus locations and licensed media; founding roles, notable people and public student stories.

## Evidence rules

- A source link is a research destination, not proof that every fact on that page was imported.
- Programme counts describe reviewed selections. Historical degree completions never count as current offerings.
- Admissions statistics describe their stated cohort. Private admitted-student records are not collected.
- Tuition keeps its academic year, degree, residency, currency and period. Missing costs are not zero.
- Founder, benefactor, graduate, attendee and faculty appointments remain distinct relationships.
- Images require documented reuse rights. Videos retain the university source page that embeds or identifies the film.
- Agent reports remain candidates until their original sources are reviewed. Collection timestamps and publication dates are separate.

## Architecture

Navigation and bookmark aliases live in `lib/profile-navigation.ts`. Legacy gallery and research links remain supported. Campus and people now have dedicated primary sections. `UniversityProfileOverview` is presentation only; it reads the existing catalogue and reviewed supplement without mutating data or loading external services. Large programme, research, map and biography views keep their existing lazy loading.

The reviewed supplement joins by exact university ID and separately checks its official domain. It remains separate from historical datasets. General university ranking positions retain publisher, year and world/country scope; specialist research tables are separate. The full Webometrics explorer loads on demand, while profiles use a compact index.

Dark mode uses neutral black surfaces, blue accents and white text. Light mode uses white surfaces and blue accents. Inter is shared across navigation, headings, forms and data views.
