# "Suggest a correction" flow (spec only, nothing built)

Goal: any visitor can flag a wrong value from the page where they see it, with a source, and the fix ends up in the dataset with credit.

## 1. Entry point

- A small "flag" icon button next to every sourced value (tuition, deadline, IELTS, etc.), visible on hover/focus on desktop, always shown as a quiet icon on mobile. Label: "Suggest a correction". Uses the existing primitives; no new colour.
- Also one link at the bottom of each university page: "Missing something? Suggest an edit".
- Each value already knows `university_id`, `field`, current value, `source_url`, `academic_year`; the button passes those.

## 2. Form (sheet on mobile, popover/dialog on desktop)

Prefilled and read-only: university, field, current value, current source.
Inputs:
1. Correct value (structured by field type: amount + currency + period for tuition; date picker for deadlines; status select for tests).
2. Official source URL (required, must be http/https; warn on known non-official hosts such as social media or agents).
3. Date you checked it (default today).
4. Optional note (500 chars).
5. Optional credit: "Show my name" toggle plus display name. Sign-in not required, but signed-in users skip the captcha and get their contributions listed.
Rules shown inline: official sources only, latest academic year only. Submit button, then a thank-you with "you will see it after review".

Validation reuses `validateFieldValue` and the zod models in `scripts/data-ops/model.ts` (shared module), so the form can never submit a shape the pipeline rejects.

## 3. Storage (proposal only; do not apply)

New table `data_suggestions` (put under `supabase/proposals/`): `id`, `university_id`, `field`, `current_value jsonb`, `proposed_value jsonb`, `source_url`, `checked_on`, `note`, `contributor_user_id nullable`, `credit_name nullable`, `status` (pending, accepted, rejected, duplicate, needs_info), `reviewer_id`, `reviewed_at`, `reject_reason`, `created_at`, `ip_hash`.
RLS: anyone may insert via an API route (not direct), only the submitter reads their own rows, only staff read all. Insert through a server route with rate limiting (e.g. 5 per hour per ip_hash/user) and the existing bot protection.

## 4. Review queue (staff page)

- List sorted by oldest pending, grouped by university, with counts by field.
- Each card: field, old value, proposed value (diff), source link opened in a new tab, our current source, age of current source, contributor, flags (source host unknown, value jumps like tuition +25%, same suggestion made by others).
- Auto-checks run on submit: schema, range gates from `scripts/data-ops/gates.ts`, source URL reachable (HEAD, skip on 403/challenge, never bypass), year current. Failing ones go to "needs_info" automatically.
- Actions: Accept, Reject (reason required), Needs info (message sent to the contributor if signed in), Duplicate.
- Two similar suggestions with the same source auto-raise confidence; one reviewer is enough for low-risk fields, two for tuition and deadlines.

## 5. Merge via data-ops

On Accept, write an observation record (`Observation` in `model.ts`) with `collector: "community"`, `method: "fetched"`, `verified: true`, `source_url`, `retrieved_at` = checked date, `academic_year`, `note` containing the suggestion id. A nightly (or on-demand) job appends accepted observations to an adapter input file, then runs the normal `npm run data:merge` and `npm run data:check`; hard errors block the merge and send the suggestion back to review. Result is a normal data PR (opensource repo) or a patch into the private curated file, so history shows who changed what.

## 6. Credit

- Contributor shown as "Corrected by NAME" on a public Contributors page and in `CONTRIBUTORS.md` of the data repo, plus per-fact attribution in the history file. Anonymous if they chose not to show a name.
- Simple levels: 1, 10, 50 accepted corrections as quiet badges on their profile. No leaderboards of volume that could reward spam.
- Email "your correction was accepted" with a link to the page.

## 7. Abuse and quality

Rate limits, captcha for anonymous, source host denylist (social, forums, agents), duplicate detection, revert via history, no auto-publish without human approval. Never accept values with no source.

## 8. Build order

1. Read-only: flag button opens a prefilled GitHub issue (works with the open repo, no backend). Cheapest first step.
2. Form + `data_suggestions` table + staff queue.
3. Auto-merge pipeline and credit page.

## Open questions for the owner

Anonymous submissions allowed (recommended, with captcha)? Where does the merged data live first, private curated file or the public data repo?
