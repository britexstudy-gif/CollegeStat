-- PROPOSAL ONLY. Not a migration and not applied anywhere. Needs owner approval.
-- Mirrors lib/plans.ts (Free / Plus / Pro). Apply by copying into a new
-- timestamped file under supabase/migrations/ after testing on a dev project.
--
-- What the app already enforces without this file
--   * AI messages per day and essay reviews per 30 days: server/plan-quota.ts
--     spends a per-plan bucket in public.consume_rate_limit (service role) on
--     every AI route, before consume_student_ai_limit.
--   * My colleges size: checked in the client (components/college/provider.tsx).
--
-- What this file adds
--   1. profiles.plan_tier: the PAID tier, written only by the service role
--      (the future payment webhook). Students cannot update it, unlike
--      preferences.plan, which is why the app ignores preferences.plan.tier.
--   2. A trigger that caps saved_universities rows per plan, so the list
--      limit holds even for direct API writes.
--
-- Limits here must match lib/plans.ts: Free 5, Plus 20, Pro unlimited.
-- Early access (preferences.plan.waitlist_at set) counts as Plus until launch,
-- the same rule as effectivePlan() in lib/plans.ts.

alter table public.profiles
  add column if not exists plan_tier text not null default 'free'
  check (plan_tier in ('free', 'plus', 'pro'));
-- Column grants: students keep updating their own preferences, never plan_tier.
revoke update (plan_tier) on public.profiles from authenticated, anon;

create or replace function public.effective_plan(owner_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when p.plan_tier in ('plus', 'pro') then p.plan_tier
    when p.preferences -> 'plan' ->> 'waitlist_at' is not null then 'plus'
    else 'free'
  end
  from public.profiles p where p.id = owner_id
$$;
revoke all on function public.effective_plan(uuid) from public, anon, authenticated;
grant execute on function public.effective_plan(uuid) to service_role;

create or replace function public.enforce_saved_universities_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  cap integer;
  used integer;
begin
  cap := case coalesce(public.effective_plan(new.user_id), 'free')
    when 'pro' then null
    when 'plus' then 20
    else 5
  end;
  if cap is null then return new; end if;
  select count(*) into used from public.saved_universities where user_id = new.user_id;
  if used >= cap then
    raise exception 'plan_limit: My colleges holds % universities on this plan', cap using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists saved_universities_plan_limit on public.saved_universities;
create trigger saved_universities_plan_limit
  before insert on public.saved_universities
  for each row execute function public.enforce_saved_universities_limit();

-- Optional follow-up once plan_tier exists: make consume_student_ai_limit()
-- plan-aware (5 / 50 / 200 a day) and drop the per-plan buckets in
-- server/plan-quota.ts, so one place counts AI use.
