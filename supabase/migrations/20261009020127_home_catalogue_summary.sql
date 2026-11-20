-- Read-only public homepage bootstrap. Uses the same QS precedence and ordering
-- as explore_universities({}, 1), without admissions, tuition or global medians.
-- Never returns profiles, user data or unpublished identities.
create or replace function public.home_catalogue_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
as $$
  with featured as (
    select u.id, u.name,
      coalesce(
        (select r.rank
         from public.ranking_entries r
         join public.ranking_editions e on e.id = r.edition_id
         join public.ranking_providers p on p.id = e.provider_id
         where r.university_id = u.id and r.verification_status = 'verified'
           and p.slug = 'qs' and e.year = 2027
           and e.subject = 'Overall' and e.region = 'Global'
         order by r.rank nulls last limit 1),
        (select (r->>'rank')::integer
         from jsonb_array_elements(coalesce(u.profile_resources->'rankings', '[]'::jsonb)) r
         where r->>'provider' = 'qs' and r->>'year' = '2027'
         limit 1)
      ) qs_rank
    from public.universities u
    where u.published
    order by qs_rank asc nulls last, u.name, u.id
    limit 12
  )
  select jsonb_build_object(
    'ids', coalesce((select jsonb_agg(id order by qs_rank asc nulls last, name, id) from featured), '[]'::jsonb),
    'total', (select count(*) from public.universities where published),
    'countries', (select count(distinct country_code) from public.universities where published)
  );
$$;
revoke all on function public.home_catalogue_summary() from public, anon, authenticated;
grant execute on function public.home_catalogue_summary() to anon, authenticated;
