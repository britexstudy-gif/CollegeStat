# CollegeStat development checkpoint — 9 October 2026

This is the earlier 9 October checkpoint, retained as history. The [evening checkpoint](EVENING-CHECKPOINT-2026-10-09.md) supersedes its UI, test counts and pending-SFA status: 44,600 reviewed aid observations and 19 official resource links are now published. The existing Vinext/React/Supabase/PostgreSQL architecture, stable URLs, private account policies, historical observations and PixelBlast are preserved. Application changes are uncommitted and have not been deployed.

## Actual database additions

| Item | Verified result |
| --- | --- |
| Published university identities | **14,003 across 212 countries** in both the bundled directory and hosted Supabase; previously hosted 9,000 across 175 countries |
| Added identities | **5,003**: the reproduced 5,000-row installed ROR selection plus three exact national-list university matches |
| Existing data preservation | All original 9,000 complete university rows have the same content checksum before/after; no existing identity, profile, URL or observation was overwritten |
| HERD FY2024 | 925 official research-expenditure positions; 801 profile links; nine combined reporting units remain unlinked; 44 provider imputation flags retained |
| NIRF 2025 | 114 selected Ministry-authored positions in 17 categories; original receipt has 59 links/33 profiles; a separate reviewed projection adds three links, giving 62 links/36 profiles |
| Staff review queue | **1,039 pending source records, 860 `needs_review` ranking entries and 18 publication-disabled editions** staged on hosted PostgreSQL; anonymous query returns zero pending entries |

The three new identities are Shri Vishwakarma Skill University, Symbiosis University of Applied Sciences and Nalsar University of Law. They are active education identities in the checksum-verified ROR release with exact registered names/websites and explicit ranking-row evidence. Seven other institute/college proposals remain held. The immutable original ranking receipt is not rewritten when an identity is reconciled. Nalsar's university route now links from the original NIRF Law #3 row.

These are institution identities, not 14,003 fully documented admissions profiles. Registry membership does not establish accreditation, ownership, degree availability, tuition, admission conditions or a logo. Newly published identities retain ROR source URLs, release, retrieval date, identifiers and aliases; the original evidence/checksum receipts remain reproducible.

## Rankings and source restrictions

Six data-backed systems are accessible in the product: existing QS, THE, ARWU and Leiden, plus the reviewed HERD and selected NIRF source tables. HERD measures research expenditure; NIRF is a selected national/category snapshot. They are not six equivalent world rankings. The national UI preserves the original positions, category, reporting period, population, imputation flags, source and permission evidence; exact canonical names can find abbreviated source labels. Its reviewed public source preview is separate from the pending hosted publication queue.

QS/THE/ARWU source rows, ties, bands and edition labels remain unchanged. The installed world source tables contain 5,197 rows, 4,820 linked and 377 unresolved. Existing regional coverage and 7,158 Leiden indicator observations are preserved. Leiden is not assigned a fabricated overall rank.

HERD reuses official NCSES/NSF government statistical tables under the recorded reuse policy. PIB permits accurate attributed reuse of Ministry-authored text; its permission does not extend to third-party ranking inputs, photographs or complete unreproduced NIRF tables. ROR metadata is CC0, with separate GeoNames CC BY 4.0 attribution. See [national imports and exact sources](RANKING-IMPORTS-2026-10-09.md).

CWUR, SCImago, URAP, U.S. News and Webometrics are not silently imported under assumed rights. CSIC Webometrics and the independently operated `webometrics.org` are different publishers. See [source/licensing review](RANKING-SOURCES-2026-10-08.md).

## UI and functionality

- Live student workspace: Today actions use actual checklist/deadline data; saved-research search, History and tablet/mobile navigation are clearer. Staff retain the grouped catalogue/review/integration/security console, truthful unavailable metrics and recovery banners. Private account state and stale requests are isolated on account switches.
- Sign-in/register retain Google, Apple and Telegram controls with actual setup states, email/password/magic-link flows and a genuine 1600×1069 attributed Toronto campus photograph. Student and staff entry branding remain separate. Session restoration, account/workspace reads and authenticated-navigation waiting are bounded; staff role failures explain the remaining student session and offer Dashboard/Switch account. Social providers and email delivery still require owner configuration/verification.
- Comparison has five actual-data views: Tuition, Admission, Enrollment, Rankings and Cost breakdown, with lightweight bars, columns and SVG donuts. Currency, year, population and period are kept separate. Donuts require coherent reported components; overlaps/conflicts are held, unknown is not zero, and ranks retain ties/bands. No currency conversion or invented cost shares.
- University pages have usable section scroll buttons, responsive actions, keyboard-accessible tables, provenance lines and honest empty states. Retrieval is never relabeled as verification. Malformed website display cannot crash the profile; branch websites cannot inherit a parent university's official mark merely from a domain suffix.
- Landing keeps full-width PixelBlast and central search, with consistent section rhythm, readable ranking cards, touch targets and reduced-motion scroll transitions. Scholarships, real campus images, working carousel, practice/writing/checklist preview, footer and tech-stack marks remain. Content is not revealed only by hovering.
- Named research questions now use a bounded identity search instead of an expensive whole-catalogue metrics query. The actual MIT request returns three sourced facts; constrained searches retain every filter and do not broaden an empty match.

## Muse Spark work and reviewable design

**Seven actual OpenCode tasks** ran using the configured `opencode/muse-spark-1.3-contributor-free#xhigh` model: live dashboard/account improvements, a separate dashboard design, comparison charts, identity/media audit, university profiles, landing refinement and account-flow review. Scopes were separated so concurrent jobs did not overwrite shared application files. Root reviewed/integrated the changes and fixed additional issues found in verification.

The separate student/staff dashboard concept is at **http://localhost:5175/** while its local server runs. It has working practice, writing, research, staff pagination, theme and responsive controls. It is a design proposal with clearly separated demonstration state; it has not replaced the live dashboard. Review [its public-source research and design rationale](../design-reviews/dashboard-oct09/research.md) and approve or discard it. The concept task emitted complete artifacts but exited with code 1; root's actual browser checks passed. The other six tasks exited successfully.

The [OpenCode guide](OPENCODE-MUSE-1.3.md) lists the exact model, reproducible launcher and 15 scoped prompt files. Tasks 01–08 remain future work prompts, not claims they were executed.

## Performance and migrations

Hosted routes no longer eagerly import the complete 60 MB local fallback and its research/program libraries. A measured isolated import fell from 1,300 ms/+734 MiB RSS to 116 ms/+37 MiB. Public caches are bounded, coalesce requests and expire; they never cache private account data or successful-looking failures. Auth/dashboard pages skip optional featured-card bootstrap. Vite ignores raw releases, exports and tool outputs.

Two additive hosted migrations were applied:

1. `20261009013407_optimize_explorer_projection.sql`: narrower invoker explorer projection; three actual before/after response contracts match. SQL execution improved from 4,707 to 3,543 ms, temporary I/O fell to zero. No data/permissions were removed.
2. `20261009020127_home_catalogue_summary.sql`: read-only invoker summary for the same twelve featured institutions, actual published total and distinct countries. Hosted result parity passed; measured SQL execution was 224 ms before the identity expansion.

No new parallel schema/tables or destructive DB changes were introduced. Identity publication used 21 bounded insert-only transactions after complete collision checks. National staging used 14 insert-only transactions with stable IDs and existing source/provider/edition equivalents; repeated imports do not overwrite history. A transport interruption was resolved by checking exact committed identities before resuming.

Cold requests still include network and profile hydration. A measured 9,000-row catalogue request took 6.2 seconds, then 19 ms cached; named MIT research after HMR took 14.9 seconds, while the constrained empty request took 1.0 second. These are development observations, not a claim that cold loading is instant. The Vinext billions-of-seconds compile label is a clock-origin display defect. See [performance evidence](PERFORMANCE-2026-10-09.md).

## Verification and remaining gaps

Typecheck, lint, **156 Node tests**, **66 Python ingestion tests**, production build and public HTTP smoke passed. Real-data comparison interactions, the separate dashboard concept, all university tabs, 330/390/768/900/1440 layouts and both themes were exercised. Ten hero resizes produced zero page/ResizeObserver errors. Hosted count, original-row preservation and anonymous pending-data denial were independently queried. Evidence is in ignored `outputs/*oct09*`; the owner still decides whether the visual design is acceptable.

Current authenticated end-to-end verification is limited: the previously used private QA account rejects its stored password. It was not reset, recreated or modified. Oct8 authenticated checks remain historical evidence, not Oct9 success claims. Owner-isolation/RLS tests and public access gates passed. Hosted advisors still flag intentional guarded sharing/staff definer functions, Auth password-protection configuration and an existing campus FK index gap; the new summary/explorer functions are invokers. The previously uninstalled DB-level MFA proposal remains separate from API-enforced write MFA.

The media audit accounts for all 14,003 identities: 11 official verified logo candidates, 540 attributed Wikimedia candidates, 3,171 unattributed image candidates held, and 10,281 safe initials/icon fallbacks. These are review categories, not a promise of approved logos for every institution. Attribution/license gaps, shared hosts and duplicate UNITID groups remain held.

Deep official admissions, language/qualification requirements, current programs, costs/aid and outcome coverage is still uneven. Existing 44,600 SFA records remain private pending, not newly approved grants. Full SAT/IELTS persistence/scoring, versioned writing, permitted accepted-student examples, student AI and consent-aware active-user analytics require further backend work. No dashboard fabricates activity, exam scores or acceptance outcomes.

## Reproduce or sync

```sh
npm run typecheck
npm run lint
npm test
npm run test:data
npm run build
TEST_BASE_URL=http://localhost:5173 node tests/http-smoke.mjs

python3 scripts/ingestion/fetch-national-ranking-sources.py --verify-cache
python3 scripts/ingestion/review-national-rankings.py --reviewed-at 2026-10-09 --output outputs/national-rankings-reproduced.json
python3 scripts/ingestion/reconcile-national-ranking-identities.py --out outputs/national-identities-reproduced.json
python3 scripts/ingestion/build-national-ranking-search.py
python3 scripts/ingestion/stage-national-rankings.py --out outputs/national-ranking-sync-review
python3 scripts/database/prepare-registry-publication.py --out outputs/registry-sync-review
python3 scripts/ingestion/audit-identity-media-oct09.py --out outputs/identity-media-reproduced

node scripts/run-muse.mjs --list
node scripts/run-muse.mjs --task 13 --model 'opencode/muse-spark-1.3-contributor-free#xhigh' --dry-run
```

Inspect each generated manifest and receipt checksum. On another authorized Supabase target, apply the registry `*-insert.sql` files in order, then the national manifest's transaction order through the existing administrative SQL workflow. Never apply preflight files as writes, set editions `permitted=true` automatically, change pending verification states automatically, or use public keys to provision staff. Cached source files retain their original retrieval dates. Source snapshots, identity additions and permission evidence must be reviewed before a new publication.
