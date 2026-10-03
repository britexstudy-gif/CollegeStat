# Hosted checkpoint — 3 October 2026

CollegeStat's local preview now reads its public catalogue and private accounts from the connected Supabase project. The publishable URL/key remain in ignored `.env.local`; administrator credentials remain in ignored `outputs/review-account.json` with mode 600.

## Installed records

| Evidence | Records |
| --- | ---: |
| Published university identities | 8,985 |
| Identity aliases | 33,135 |
| Traceable sources | 985 |
| Cost observations | 4,549 |
| Admission observations | 967 |
| Official program offerings | 184 |
| Licensed campus photographs | 772 |
| Structured requirements | 13 |
| Scoped application deadlines | 10 |
| Linked scholarship awards | 7 |

Profile resources also retain reported qualifications, research identities and recent papers, official application/funding links, contact/social accounts and publisher student snapshots. The public ranking endpoint sends ranking observations and Leiden records rather than every imported observation. Current verified database rankings supersede earlier installed observations; bands and ties retain their literal labels. Search selects the latest reported admission year across canonical and government observations, with unknown values last.

The October 3 official-source additions cover NUS general international qualifications and its undergraduate scholarship, plus NTU qualification-specific English requirements and its IB application date. NUS's date page has a conflicting portal status, so the record asks applicants to confirm availability. NUS scholarship coverage is after the MOE Tuition Grant; its employment-bond condition is explicit. Dates and applicant categories are not generalized to other students.

- [NUS international admission requirements](https://www.nus.edu.sg/oam/admissions/international-qualifications-for-foreigners/admission-requirements)
- [NUS important dates](https://www.nus.edu.sg/oam/admissions/important-dates)
- [NUS international undergraduate scholarship](https://www.nus.edu.sg/oam/scholarships/scholarships-for-freshmen-international-students/nus-international-undergraduate-scholarship)
- [NTU general admission requirements and timelines](https://www.ntu.edu.sg/admissions/undergraduate/admissions/general-admission-requirements)

## Product and architecture

Sign-in is a dedicated responsive page with labelled email/password fields, password visibility, recovery and a safe return to the research page. Unconfigured social sign-in providers are hidden. Public catalogue failures do not prevent the authentication page from rendering.

Staff enter at `/staff/college-console`; `/admin` returns 404. The staff editor covers university logos and attribution, programs, sources, requirements, scoped deadlines, scholarship relationships and import review. Conditional requirements have a distinct unspecified state. Real administrator JWTs and database roles are required, independently of the URL. A confirmed administrator review account has a three-university comparison, shortlist and preparation checklist; its password is intentionally outside the repository.

The 404 page has a newly generated cobalt editorial collage. The approved homepage collage and navbar remain. Glass refraction uses a cached, bounded rim displacement on eligible Chromium desktops; other browsers and constrained devices use the lighter CSS fallback. Visual and touch behavior still need the owner's review. The full ranking JSON no longer appears in the browser's JavaScript bundle; the former 2.8 MB ranking chunk is eliminated. Mapping remains a lazy, comparatively large optional dependency.

## Verification and remaining work

TypeScript, ESLint, 73 automated tests, the production build, local HTTP checks against the hosted catalogue and `verify-hosted.ts` passed. Hosted checks exercised exact imported counts, real password sign-in, profile resources, temporary private-note ownership, anonymous write denial, seeded comparison and authenticated admin API validation. The temporary note was removed. Local PostgreSQL checks also exercise two-user isolation and role escalation. No browser or computer-use automation was used for this checkpoint.

The security advisor reports intentional guarded SECURITY DEFINER functions, a service-only rate-limit table, and disabled leaked-password protection. Role and ownership checks cover the guarded functions; their permissions are explicit. [Supabase's function guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [password settings](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) document those notices. The performance advisor's remaining notices concern indexes not yet used on the new database; the foreign-key and repeated-auth-evaluation findings were addressed.

Worldwide requirement/deadline/scholarship coverage is incomplete. Official logos cover a small share of the directory, and sourced galleries cover 498 profiles. The selected regional rankings are not complete publisher tables. A directory entry is not proof of a current intake or a scholarship, and an unranked institution is not assigned an invented publisher rank. Unknown sections retain actionable official routes and explicit source scope.

Production deployment, real storage uploads, enabled OAuth/email delivery, account deletion and scheduled refresh publication have not been verified. Refresh workflows retain results as reviewable artifacts; feeds default to disabled. Source snapshots keep their original reporting/retrieval dates rather than inheriting this checkpoint's date.
