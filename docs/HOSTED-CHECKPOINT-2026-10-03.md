# Hosted checkpoint — 3 October 2026

CollegeStat's local preview now reads its public catalogue and private accounts from the connected Supabase project. The publishable URL/key remain in ignored `.env.local`; administrator credentials remain in ignored `outputs/review-account.json` with mode 600.

## Installed records

| Evidence | Records |
| --- | ---: |
| Published university identities | 8,985 |
| Identity aliases | 33,135 |
| Traceable sources | 992 |
| Cost observations | 4,549 |
| Admission observations | 967 |
| Official program offerings | 184 |
| Licensed campus photographs | 772 |
| Structured requirements | 31 across 10 institutions |
| Scoped application deadlines | 10 |
| Linked scholarship awards | 7 |

Profile resources also retain reported qualifications, research identities and recent papers, official application/funding links, contact/social accounts and publisher student snapshots. The public ranking endpoint sends ranking observations and Leiden records rather than every imported observation. Current verified database rankings supersede earlier installed observations; bands and ties retain their literal labels. Search selects the latest reported admission year across canonical and government observations, with unknown values last.

The October 3 official-source additions cover NUS general international qualifications and its undergraduate scholarship, plus NTU qualification-specific English requirements and its IB application date. NUS's date page has a conflicting portal status, so the record asks applicants to confirm availability. NUS scholarship coverage is after the MOE Tuition Grant; its employment-bond condition is explicit. Dates and applicant categories are not generalized to other students.

- [NUS international admission requirements](https://www.nus.edu.sg/oam/admissions/international-qualifications-for-foreigners/admission-requirements)
- [NUS important dates](https://www.nus.edu.sg/oam/admissions/important-dates)
- [NUS international undergraduate scholarship](https://www.nus.edu.sg/oam/scholarships/scholarships-for-freshmen-international-students/nus-international-undergraduate-scholarship)
- [NTU general admission requirements and timelines](https://www.ntu.edu.sg/admissions/undergraduate/admissions/general-admission-requirements)

## Product and architecture

Sign-in is a dedicated responsive page with labelled email/password fields, password visibility, recovery and a safe return to the research page. It uses a wider illustrated layout and one compact row of provider buttons. `/api/auth/providers` attests to provider availability using the hosted Auth settings; unavailable actions remain disabled. Google and Apple are currently disabled on the project. Telegram OIDC also needs its provider credentials and server-side availability attestation. Configuration instructions are in [AUTH-PROVIDERS.md](AUTH-PROVIDERS.md). Public catalogue failures do not prevent the authentication page from rendering.

Staff enter at `/staff/college-console`; `/admin` returns 404. The staff editor covers university logos and attribution, programs, sources, requirements, scoped deadlines, scholarship relationships and import review. Conditional requirements have a distinct unspecified state. Real administrator JWTs and database roles are required, independently of the URL. A confirmed administrator review account has a three-university comparison, shortlist and preparation checklist; its password is intentionally outside the repository.

The recovery page pairs the cobalt illustration with a compact search and recovery actions. The approved homepage collage remains. Navigation, university cards, requirements, comparison, sign-in and dashboard now have their own layout rules, with smaller typography and responsive spacing. The application-platform guide is an unboxed, compact row with its full official mark. The old standalone regional-ranking section is removed; available sourced regional positions appear in green beside blue world ranks. Ranking-row identities now carry the same current observations as their badges, fixing the earlier Stanford edition mismatch.

The dashboard prioritizes unfinished tasks by due date, supports exact task dates, and shows progress and overdue counts. Writes are owner-scoped, and failed additions retain their draft. Comparison starts with populated Essentials, expandable requirements, category controls and a bounded scrolling evidence table. Empty rows are hidden initially; full data, source context, sharing and export remain available. The protected staff console has grouped navigation, current database counts and shortcuts to editorial queues.

Glass controls use half-pixel grey outlines. Refraction now captures the page directly, with a transparent directional glint and a neutral center; it no longer processes an already-frosted sibling. Compact filter triggers, selected profile sections and slider thumbs use the shared enhancement. Maps are cached, bounded to 180,000 pixels, and regenerated only after debounced visible size changes. Constrained devices and reduced transparency/motion or higher contrast use the readable fallback. SVG backdrop displacement currently depends on Chromium support, as discussed in [Kube's article](https://kube.io/blog/liquid-glass-css-svg/) and [MDN's backdrop-filter guidance](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter). There is no continuous animation or scroll rendering loop. Visual/touch judgment remains with the owner.

Admission-rate filters update visibly during dragging and apply on release; separate minimum/maximum fields accept exact percentages. Active admission/academic constraints expand their group on initial rendering. Keyboard focus uses restrained grey parent/field indications. The full ranking JSON remains outside the browser's JavaScript bundle; the former 2.8 MB ranking chunk is eliminated. Mapping remains a lazy, comparatively large optional dependency.

## Verification and remaining work

TypeScript, ESLint, 73 automated tests, the production build, local HTTP checks against the hosted catalogue and `verify-hosted.ts` passed. Hosted checks exercised exact imported counts, real password sign-in, profile resources, temporary private-note ownership, anonymous write denial, seeded comparison and authenticated admin API validation. The temporary note was removed. Local PostgreSQL checks also exercise two-user isolation and role escalation. No browser or computer-use automation was used for this checkpoint.

The subsequent interface/policy pass adds five tests, bringing the suite to 78. The read-only HTTP suite verifies provider availability, active percentage controls, consistent ranking editions and refreshed MIT/Stanford requirements alongside the existing routes, privacy denials and profile/media checks. Live SQL confirms all 31 requirements are verified, with 992 source records. The reviewed requirement bundle supersedes older seed policies, preserves newer verified staff edits and explicitly reaffirms only matching reviewed content after the database's verification-invalidation guard. It never disables the guard or publishes a different pending draft.

The first clean GitHub runner exposed a 2 GB TypeScript heap limit while inferring the large dataset snapshots. [Bounded dataset declarations](TYPECHECK-DATASETS.md) now keep those imports typed without inferring every row. The fresh local check passes under the same 2 GB limit and reports about 800 MB of compiler memory; lint, all 73 tests and the production build also pass after the change. CI retains the explicit heap limit.

The security advisor reports intentional guarded SECURITY DEFINER functions, a service-only rate-limit table, and disabled leaked-password protection. Role and ownership checks cover the guarded functions; their permissions are explicit. [Supabase's function guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [password settings](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) document those notices. The performance advisor's remaining notices concern indexes not yet used on the new database; the foreign-key and repeated-auth-evaluation findings were addressed.

Worldwide requirement/deadline/scholarship coverage is incomplete. Official logos cover a small share of the directory, and sourced galleries cover 498 profiles. The selected regional rankings are not complete publisher tables. A directory entry is not proof of a current intake or a scholarship, and an unranked institution is not assigned an invented publisher rank. Unknown sections retain actionable official routes and explicit source scope.

Production deployment, real storage uploads, enabled OAuth/email delivery, account deletion and scheduled refresh publication have not been verified. Refresh workflows retain results as reviewable artifacts; feeds default to disabled. Source snapshots keep their original reporting/retrieval dates rather than inheriting this checkpoint's date.
