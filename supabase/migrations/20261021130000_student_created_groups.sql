-- Study groups are created by students instead of a fixed built-in list.
-- Members still see only counts and effort, never who else joined.
create table public.study_groups(
  slug text primary key check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(btrim(name)) between 3 and 60),
  topic text not null check (topic in ('test','country','field','funding','other')),
  description text not null default '' check (char_length(description) <= 280),
  created_by uuid not null references auth.users on delete cascade,
  created_at timestamptz not null default now()
);
create index study_groups_created_by_idx on public.study_groups(created_by);
alter table public.study_groups enable row level security;
revoke all on public.study_groups from public, anon, authenticated;
grant select(slug, name, topic, description, created_at) on public.study_groups to authenticated;
grant insert(slug, name, topic, description, created_by) on public.study_groups to authenticated;
grant delete on public.study_groups to authenticated;
create policy study_groups_read on public.study_groups for select to authenticated using (true);
create policy study_groups_create on public.study_groups for insert to authenticated
  with check (created_by = (select auth.uid()));
create policy study_groups_delete_own on public.study_groups for delete to authenticated
  using (created_by = (select auth.uid()));

-- At most five groups per student, to keep the directory useful.
create function public.limit_study_groups() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.study_groups where created_by = new.created_by) >= 5 then
    raise exception 'You can create up to 5 groups.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger study_groups_limit before insert on public.study_groups
  for each row execute function public.limit_study_groups();

-- The fixed built-in groups are retired; memberships must name a real group.
delete from public.study_group_members m
  where not exists (select 1 from public.study_groups g where g.slug = m.group_slug);
alter table public.study_group_members
  add constraint study_group_members_group_fk foreign key (group_slug)
  references public.study_groups(slug) on delete cascade;

drop function if exists public.study_group_overview();
create function public.study_group_overview()
returns table(group_slug text, name text, topic text, description text, mine boolean,
              members bigint, weekly_xp bigint, active_today bigint, joined boolean)
language sql stable security definer set search_path = '' as $$
  select g.slug, g.name, g.topic, g.description, g.created_by = auth.uid(),
    count(m.user_id),
    coalesce(sum((select sum(a.xp) from public.student_activity a where a.user_id = m.user_id
      and a.day >= date_trunc('week', now() at time zone 'utc')::date)), 0)::bigint,
    count(m.user_id) filter (where exists(select 1 from public.student_activity a
      where a.user_id = m.user_id and a.day = (now() at time zone 'utc')::date)),
    coalesce(bool_or(m.user_id = auth.uid()), false)
  from public.study_groups g
  left join public.study_group_members m on m.group_slug = g.slug
  group by g.slug
  order by count(m.user_id) desc, g.created_at desc
  limit 200
$$;
revoke all on function public.study_group_overview() from public, anon;
grant execute on function public.study_group_overview() to authenticated;
