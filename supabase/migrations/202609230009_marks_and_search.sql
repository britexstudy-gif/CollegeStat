alter table public.universities add column logo_source_url text check(logo_source_url ~ '^https://');
alter table public.universities add column logo_usage_notes text;
-- Search exact names/acronyms first, then aliases and approximate names.
create or replace function public.search_universities(search_term text, result_limit integer default 8)
returns setof public.universities language sql stable security invoker set search_path=public as $$
 with input as (select left(trim(coalesce(search_term,'')),200) q)
 select u.* from public.universities u cross join input i
 where u.published and (
  i.q='' or lower(u.short_name)=lower(i.q) or u.name ilike '%'||i.q||'%' or u.short_name ilike '%'||i.q||'%'
  or u.city ilike '%'||i.q||'%' or u.country_code ilike i.q or u.region ilike i.q
  or similarity(u.name,i.q)>.15
  or exists(select 1 from public.university_aliases a where a.university_id=u.id and (a.alias ilike '%'||i.q||'%' or similarity(a.alias,i.q)>.3))
  or exists(select 1 from public.university_programs up join public.programs p on p.id=up.program_id where up.university_id=u.id and up.verification_status='verified' and (p.name||' '||p.subject) ilike '%'||i.q||'%')
 ) order by coalesce(lower(u.short_name)=lower(i.q) or lower(u.name)=lower(i.q),false) desc, similarity(u.name,i.q) desc,u.name,u.id
 limit greatest(1,least(coalesce(result_limit,8),20))
$$;
