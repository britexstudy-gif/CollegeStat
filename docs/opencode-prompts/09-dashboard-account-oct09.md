# CollegeStat dashboard and account refinement — 9 October 2026

Work in this existing repository with the selected Muse Spark 1.3 xhigh model. Deliver substantial working UI improvements, not a design proposal. Read the current Oct8 checkpoint and request checklist, then inspect the current files before editing. Existing uncommitted work belongs to this project: preserve it.

## Ownership and boundaries

Own only `pages-ui/workspace.tsx`, `pages-ui/admin.tsx`, `components/college/auth.tsx`, dashboard/account-specific components you need to add, and a new `app/dashboard-account-oct09.css` imported from the existing global CSS import list. Read shared services/types rather than changing their contracts. Do not edit Vite, build/, app/layout.tsx, server/, API routes, ranking datasets/adapters or Supabase migrations: parallel agents own those. Do not run the production build while parallel agents are working. Do not restart/stop the preview server. No hosted writes, deployment, credential access, user promotion, external messaging or publication. Do not read .env, outputs/review-account.json or authentication stores. Do not alter Obsidian; root will update it after verifying the combined changes. Keep PixelBlast and the animated footer.

## Public reference research, original design

The user requested OnePrep-inspired comfort and less computer use. The public official site https://www.oneprep.com/ shows a diagnosis → planning → focused practice flow, topic-specific questions, marking for review, step-by-step reasoning, weekly study slots and accuracy/pacing analytics. Use this workflow as inspiration for an original CollegeStat UI. Do not copy OnePrep's questions, illustrations, dashboard screenshots, predicted scores or account data. Do not create accounts or log into their product. Existing CollegeStat offers a small original exercise bank; it must not claim official SAT/IELTS mocks, score prediction or invented progress.

## Student dashboard

Make this feel like a comfortable workspace: clear navigation, a focused today area, practical learning actions, a useful shortlist/application area, and clear progress/status from real available state. Keep existing saved universities, scholarships, tasks, calendar, research history, guides and comparison features. Design coherent side navigation that works on mobile and keyboard; use consistent content widths and actual information hierarchy rather than a wall of equal cards. Provide accessible search across the user's real workspace items with actionable results and a clear empty result state. Preserve owner-scoped data, honest loading/errors and the real practice/writing studios. If a feature has no backend, state its actual available behavior instead of fake analytics. Make original practice and writing easy to discover and use. No invented streaks, percentiles, predicted admission rates or accepted-letter examples.

## Admin dashboard

Make existing catalogue/data management useful for daily work: searchable navigation, visible current section, clearly grouped catalogue/evidence/operations, real service metrics and meaningful loading/error/retry states. Present verification/review and source data as clear actionable work. Preserve editor dialogs, permissions, MFA write controls, source evidence, audit handling and all existing entities. Never imply active users, usage analytics or imports are connected when they are not. Root is reviewing new official NCSES HERD and NIRF ranking imports separately; do not modify those datasets.

## Account pages and photograph

Replace the current empty writing-desk screenshot on the user sign-in side with a genuine reviewed campus photograph already available in `public/images/scholarships/` and its manifest/attribution. Make the photograph legible and substantial with a considered crop, blue/black treatment and clear CollegeStat branding. Show the creator/licence attribution compactly with source links. Improve sign-in and register hierarchy, spacing, visibility and mobile behavior. Keep working email, magic link, recovery, password visibility, caps lock and redirect flows. Google/Apple/Telegram options must remain visible and reflect backend availability; do not fake successful integrations or enable unconfigured providers. Keep staff entry visually separate and preserve staff/MFA checks. Light is the default; dark is neutral near-black with blue accents, not navy on darker navy.

## Validation and delivery

Use local code inspection and small targeted checks, not long computer-use exploration. Root will run account/browser and production checks after integration. Run scoped lint and typecheck if ready; report precise files changed, new functionality, existing integration limits and any failed check. Write a concise report to `outputs/muse-dashboard-oct09-report.md`. Never include credentials/private records in reports. Complete the implementation before ending the task.
