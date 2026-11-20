-- PROPOSAL ONLY. Not a migration and not applied anywhere. Needs owner approval.
-- Apply by copying into a new timestamped file under supabase/migrations/ (or
-- the Supabase SQL editor) after testing on a development project.
--
-- Why
-- lib/plans.ts advertises "5 AI requests a day" for Free. What is enforced today
-- (supabase/migrations/20261012015911_student_ai_owner_quota.sql) is:
--   * 12 requests per account per 1-hour window (up to ~288 a day), and
--   * 50 requests per 24-hour window for the WHOLE APP, shared by every user.
-- Both /api/student-ai and /api/agent (the AI coach, one hit per message) call
-- consume_student_ai_limit(). After launch the shared 50/day cap would block all
-- students once 50 requests in total had been made.
-- Windows are fixed, not rolling: each opens at the first request in the bucket
-- and resets window_seconds later (see public.consume_rate_limit).
--
-- What this changes
--   * Per account: 5 requests per 24-hour window (matches the Free plan copy).
--     The hourly 12 bucket is dropped because 5/day is stricter.
--   * App-wide provider cost guard raised from 50 to 1000 per 24-hour window.
--     1000 is a placeholder: choose it from the DeepSeek/Groq budget.
--   * Pro is not distinguished. The only plan marker today is
--     profiles.preferences.plan.tier, which every user can write
--     (grant update(preferences) to authenticated), so it must not raise a quota.
--     A Pro allowance needs a server-written column (e.g. updated only by the
--     payment webhook with the service role) before it can be trusted here.
--   * Signature, grants and security definer/search_path stay the same, so no
--     application code change is needed. The new bucket name starts fresh;
--     the old 'student-ai:<uuid>' rows simply expire.
create or replace function public.consume_student_ai_limit()
returns boolean language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid();
begin
 if owner_id is null then raise exception 'Sign in required' using errcode='42501'; end if;
 -- Checked first so one account cannot spend the shared budget beyond its own 5.
 if not public.consume_rate_limit('student-ai-day:'||owner_id::text,5,86400) then return false; end if;
 return public.consume_rate_limit('student-ai:app-daily',1000,86400);
end $$;
revoke all on function public.consume_student_ai_limit() from public,anon;
grant execute on function public.consume_student_ai_limit() to authenticated;
comment on function public.consume_student_ai_limit() is '5 student AI requests per account per 24-hour window (Free plan) and 1000 app-wide per 24-hour window. Windows open at the first request. Fixed owner and quotas; no caller-controlled buckets, limits or private content.';
