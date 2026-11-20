-- Student progress (XP, streaks), opt-in weekly leaderboard, study groups and
-- anonymised "students like me" insights. XP is assigned by the database, never
-- trusted from the client, and every peer view is aggregated with k >= 3.

create table public.student_activity(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  kind text not null check(kind in ('practice','article','task','shortlist','ai','writing','profile','checkin')),
  ref text not null check(length(ref) between 1 and 120),
  day date not null default (now() at time zone 'utc')::date,
  xp integer not null default 0,
  created_at timestamptz not null default now(),
  unique(user_id, kind, ref, day)
);
create index student_activity_day_idx on public.student_activity(day);
alter table public.student_activity enable row level security;
grant select on public.student_activity to authenticated;
grant insert(user_id, kind, ref) on public.student_activity to authenticated;
create policy activity_owner_read on public.student_activity for select to authenticated
  using (user_id = (select auth.uid()));
create policy activity_owner_insert on public.student_activity for insert to authenticated
  with check (user_id = (select auth.uid()));

create function public.student_activity_award() returns trigger language plpgsql
  set search_path = '' as $$
declare cap integer; used integer;
begin
  new.day := (now() at time zone 'utc')::date;
  new.created_at := now();
  new.xp := case new.kind
    when 'practice' then 20 when 'writing' then 15 when 'task' then 15
    when 'profile' then 25 when 'article' then 10 when 'ai' then 10
    when 'checkin' then 10 else 5 end;
  cap := case new.kind when 'article' then 5 when 'ai' then 3 when 'shortlist' then 5
    when 'checkin' then 1 when 'profile' then 1 else 10 end;
  select count(*) into used from public.student_activity
    where user_id = new.user_id and kind = new.kind and day = new.day;
  if used >= cap then new.xp := 0; end if;
  return new;
end $$;
create trigger student_activity_award before insert on public.student_activity
  for each row execute function public.student_activity_award();

-- Opt-in public name for the weekly leaderboard.
create table public.leaderboard_members(
  user_id uuid primary key references auth.users on delete cascade,
  display_name text not null check(length(trim(display_name)) between 2 and 40),
  joined_at timestamptz not null default now()
);
alter table public.leaderboard_members enable row level security;
grant select, delete on public.leaderboard_members to authenticated;
grant insert(user_id, display_name), update(display_name) on public.leaderboard_members to authenticated;
create policy leaderboard_owner_read on public.leaderboard_members for select to authenticated
  using (user_id = (select auth.uid()));
create policy leaderboard_owner_insert on public.leaderboard_members for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy leaderboard_owner_update on public.leaderboard_members for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy leaderboard_owner_delete on public.leaderboard_members for delete to authenticated
  using (user_id = (select auth.uid()));

create function public.weekly_leaderboard(result_limit integer default 10)
returns table(rank bigint, display_name text, xp bigint, active_days bigint, is_me boolean)
language sql stable security definer set search_path = '' as $$
  with week as (
    select m.user_id, m.display_name,
      coalesce(sum(a.xp), 0) as xp, count(distinct a.day) as active_days
    from public.leaderboard_members m
    left join public.student_activity a on a.user_id = m.user_id
      and a.day >= date_trunc('week', now() at time zone 'utc')::date
    group by m.user_id, m.display_name
  ), ranked as (
    select row_number() over (order by xp desc, active_days desc, display_name) as rank,
      display_name, xp, active_days, user_id = auth.uid() as is_me
    from week
  )
  select rank, display_name, xp, active_days, is_me from ranked
  where rank <= least(greatest(result_limit, 1), 50) or is_me
  order by rank
$$;
revoke all on function public.weekly_leaderboard(integer) from public, anon;
grant execute on function public.weekly_leaderboard(integer) to authenticated;

-- Study groups are a fixed catalogue (see lib/student-progress.ts).
create table public.study_group_members(
  user_id uuid not null references auth.users on delete cascade,
  group_slug text not null check(group_slug ~ '^[a-z0-9-]{2,40}$'),
  joined_at timestamptz not null default now(),
  primary key(user_id, group_slug)
);
create index study_group_members_slug_idx on public.study_group_members(group_slug);
alter table public.study_group_members enable row level security;
grant select, delete on public.study_group_members to authenticated;
grant insert(user_id, group_slug) on public.study_group_members to authenticated;
create policy group_owner_read on public.study_group_members for select to authenticated
  using (user_id = (select auth.uid()));
create policy group_owner_insert on public.study_group_members for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy group_owner_delete on public.study_group_members for delete to authenticated
  using (user_id = (select auth.uid()));

create function public.study_group_overview()
returns table(group_slug text, members bigint, weekly_xp bigint, active_today bigint, joined boolean)
language sql stable security definer set search_path = '' as $$
  select g.group_slug, count(*) as members,
    coalesce(sum((select sum(a.xp) from public.student_activity a where a.user_id = g.user_id
      and a.day >= date_trunc('week', now() at time zone 'utc')::date)), 0)::bigint as weekly_xp,
    count(*) filter (where exists(select 1 from public.student_activity a where a.user_id = g.user_id
      and a.day = (now() at time zone 'utc')::date)) as active_today,
    bool_or(g.user_id = auth.uid()) as joined
  from public.study_group_members g
  group by g.group_slug
$$;
revoke all on function public.study_group_overview() from public, anon;
grant execute on function public.study_group_overview() to authenticated;

-- Anonymised: universities most saved by students with the same field or
-- destination. Only universities saved by at least 3 such students appear.
create function public.peer_insights(p_field text default null, p_country text default null)
returns table(university_id uuid, students bigint, peers bigint)
language sql stable security definer set search_path = '' as $$
  with peers as (
    select p.id from public.profiles p
    where p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
      and (
        (nullif(trim(p_field), '') is not null and p.preferences->>'field' ilike trim(p_field))
        or (nullif(trim(p_country), '') is not null and p.preferences->'countries' ? upper(trim(p_country)))
      )
  ), total as (select count(*) as n from peers)
  select s.university_id, count(distinct s.user_id) as students, (select n from total) as peers
  from public.saved_universities s join peers on peers.id = s.user_id
  group by s.university_id
  having count(distinct s.user_id) >= 3
  order by students desc
  limit 6
$$;
revoke all on function public.peer_insights(text, text) from public, anon;
grant execute on function public.peer_insights(text, text) to authenticated;
