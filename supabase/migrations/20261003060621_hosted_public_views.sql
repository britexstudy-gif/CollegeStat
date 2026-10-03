create or replace function public.explore_universities(filters jsonb default '{}', page_number integer default 1) returns jsonb language plpgsql stable security invoker set search_path=public,extensions as $$
declare k text; v jsonb; n numeric; begin
 if filters is null or jsonb_typeof(filters)<>'object' or octet_length(filters::text)>5000 or page_number is null or page_number not between 1 and 10000 then raise exception 'Invalid search'; end if;
 for k,v in select * from jsonb_each(filters) loop
 if k not in ('q','country','region','city','field','degree','language','type','aid','scholarships','sort','cost_max','admission_min','admission_max','ielts_max','intl_min','graduation_min','page') then raise exception 'Unknown filter'; end if;
 if k in ('cost_max','admission_min','admission_max','ielts_max','intl_min','graduation_min','page') then
 if jsonb_typeof(v)<>'number' then raise exception 'Invalid numeric filter'; end if;
 n:=(v#>>'{}')::numeric; if n<0 or n>(case when k='cost_max' then 1000000 when k='page' then 10000 when k='ielts_max' then 9 else 100 end) then raise exception 'Filter outside bounds'; end if;
 else if jsonb_typeof(v)<>'string' or length(v#>>'{}')>200 then raise exception 'Invalid text filter'; end if; end if;
 end loop;
 return (with facts as (
select u.*,
 coalesce((select r.rank from public.ranking_entries r join public.ranking_editions e on e.id=r.edition_id join public.ranking_providers p on p.id=e.provider_id where r.university_id=u.id and r.verification_status='verified' and p.slug='qs' and e.year=2027 and e.subject='Overall' and e.region='Global' order by r.rank nulls last limit 1),(select (r->>'rank')::integer from jsonb_array_elements(coalesce(u.profile_resources->'rankings','[]'::jsonb)) r where r->>'provider'='qs' and r->>'year'='2027' limit 1)) qs_rank,
 coalesce((select value from (
   select a.acceptance_rate value,a.year,1 priority from public.admissions a where a.university_id=u.id and a.program_id is null and a.verification_status='verified' and a.acceptance_rate is not null
   union all select d.value,d.year,2 from public.data_points d where d.university_id=u.id and d.canonical and d.verification_status='verified' and d.metric='admission' and d.value is not null
   union all select (r->>'value')::numeric,(r->>'reporting_year')::integer,3 from jsonb_array_elements(coalesce(u.imported_records,'[]'::jsonb)) r where r->>'metric'='acceptance_rate' and jsonb_typeof(r->'value')='number' and r->>'reporting_year' is not null and r->>'verification_status'='verified' and r->>'publication_status'='published'
 ) observations order by year desc nulls last,priority limit 1),(u.profile_resources#>>'{discovery,admission}')::numeric) admission,
 coalesce((select c.amount from public.costs c where c.university_id=u.id and c.verification_status='verified' and c.program_id is null and c.category='tuition' and c.currency='USD' and c.period='year' and c.student_category='international' order by c.year desc nulls last limit 1),(u.profile_resources#>>'{discovery,tuition}')::numeric) tuition,
 coalesce((select d.value from public.data_points d where d.university_id=u.id and d.canonical and d.verification_status='verified' and d.metric='international_students' order by d.year desc nulls last limit 1),(u.profile_resources#>>'{discovery,international}')::numeric) international,
 coalesce((select d.value from public.data_points d where d.university_id=u.id and d.canonical and d.verification_status='verified' and d.metric='graduation_rate' order by d.year desc nulls last limit 1),(u.profile_resources#>>'{discovery,graduation}')::numeric) graduation,
 coalesce((select d.value from public.data_points d where d.university_id=u.id and d.canonical and d.verification_status='verified' and d.metric='aid_recipients' order by d.year desc nulls last limit 1),(u.profile_resources#>>'{discovery,aid}')::numeric) aid,
 coalesce((select r.minimum from public.requirements r where r.university_id=u.id and r.program_id is null and r.kind='IELTS' and r.verification_status='verified' order by r.year desc nulls last,r.verified_at desc limit 1),(select a.ielts_min from public.admissions a where a.university_id=u.id and a.program_id is null and a.verification_status='verified' order by a.year desc nulls last limit 1)) ielts
from public.universities u where u.published), matched as (
 select * from facts u where
 (coalesce(filters->>'q','')='' or not exists(select 1 from regexp_split_to_table(lower(trim(filters->>'q')), E'\\s+') term where term<>'' and lower(concat_ws(' ',u.name,u.short_name,u.city,u.region,u.country_code,u.profile_resources->>'country_name',u.aliases::text,u.profile_resources->'reported_programs')) not like '%'||term||'%')) and
 (coalesce(filters->>'country','')='' or u.country_code=filters->>'country') and
 (coalesce(filters->>'region','')='' or u.region=filters->>'region') and
 (coalesce(filters->>'city','')='' or u.city ilike '%'||(filters->>'city')||'%') and
 (coalesce(filters->>'type','')='' or u.university_type=filters->>'type') and
 (not filters ? 'cost_max' or tuition<=(filters->>'cost_max')::numeric) and
 (not filters ? 'admission_min' or admission>=(filters->>'admission_min')::numeric) and
 (not filters ? 'admission_max' or admission<=(filters->>'admission_max')::numeric) and
 (not filters ? 'ielts_max' or ielts<=(filters->>'ielts_max')::numeric) and
 (not filters ? 'intl_min' or international>=(filters->>'intl_min')::numeric) and
 (not filters ? 'graduation_min' or graduation>=(filters->>'graduation_min')::numeric) and
 (coalesce(filters->>'aid','')='' or aid>0) and
 (coalesce(filters->>'scholarships','')='' or exists(select 1 from public.university_scholarships us join public.scholarships s on s.id=us.scholarship_id where us.university_id=u.id and s.published and s.verification_status='verified')) and
 ((coalesce(filters->>'field','')='' and coalesce(filters->>'degree','')='' and coalesce(filters->>'language','')='') or exists(
 select 1 from public.university_programs up join public.programs p on p.id=up.program_id where up.university_id=u.id and up.verification_status='verified'
 and (coalesce(filters->>'field','')='' or (p.name||' '||p.subject) ilike '%'||(filters->>'field')||'%')
 and (coalesce(filters->>'degree','')='' or p.degree_level=filters->>'degree')
 and (coalesce(filters->>'language','')='' or p.language=filters->>'language')) or (coalesce(filters->>'language','')='' and exists(select 1 from jsonb_array_elements(coalesce(u.profile_resources->'reported_programs','[]'::jsonb)) p where (coalesce(filters->>'field','')='' or p->>'name' ilike '%'||(filters->>'field')||'%') and (coalesce(filters->>'degree','')='' or p->>'level'=filters->>'degree'))))
), page as (
select id from matched order by case when coalesce(filters->>'sort','rank') in ('rank','name') then qs_rank end asc nulls last,case when filters->>'sort'='rank_desc' then qs_rank end desc nulls last,case when filters->>'sort'='admission_desc' then admission end desc nulls last,case when filters->>'sort'='international_asc' then international end asc nulls last,case when filters->>'sort'='tuition' then tuition end asc nulls last,case when filters->>'sort'='tuition_desc' then tuition end desc nulls last,case when filters->>'sort'='admission' then admission end asc nulls last,case when filters->>'sort'='international' then international end desc nulls last,name,id limit 24 offset greatest(0,least(page_number-1,9999))*24)
select jsonb_build_object('ids',coalesce((select jsonb_agg(id) from page),'[]'),'total',(select count(*) from matched),'medianTuition',(select percentile_cont(.5) within group(order by tuition) from matched),'medianAdmission',(select percentile_cont(.5) within group(order by admission) from matched),'countries',(select count(distinct country_code) from matched)));
end $$;

-- Send only ranking evidence to the ranking directory, not all imported observations.
create function public.ranking_profiles(result_offset integer default 0,result_limit integer default 1000)
returns setof jsonb language sql stable security invoker set search_path=public as $$
 select jsonb_build_object(
 'id',u.id,'name',u.name,'slug',u.slug,'short_name',u.short_name,'country_code',u.country_code,'city',u.city,'website',u.website,'logo_url',u.logo_url,'logo_source_url',u.logo_source_url,'logo_usage_notes',u.logo_usage_notes,
 'rankings',coalesce(u.profile_resources->'rankings','[]'::jsonb),
 'imported_records',coalesce((select jsonb_agg(r) from jsonb_array_elements(coalesce(u.imported_records,'[]'::jsonb)) r where r->>'source'='leiden' and r->>'verification_status'='verified' and r->>'publication_status'='published'),'[]'::jsonb),
 'ranking_entries',coalesce((select jsonb_agg(to_jsonb(r) || jsonb_build_object('data_sources',to_jsonb(s),'ranking_editions',to_jsonb(e) || jsonb_build_object('ranking_providers',to_jsonb(p)))) from public.ranking_entries r join public.ranking_editions e on e.id=r.edition_id join public.ranking_providers p on p.id=e.provider_id join public.data_sources s on s.id=r.source_id where r.university_id=u.id and r.verification_status='verified'),'[]'::jsonb)
 ) from public.universities u where u.published and
 (jsonb_array_length(coalesce(u.profile_resources->'rankings','[]'::jsonb))>0 or exists(select 1 from public.ranking_entries r where r.university_id=u.id and r.verification_status='verified') or exists(select 1 from jsonb_array_elements(coalesce(u.imported_records,'[]'::jsonb)) r where r->>'source'='leiden' and r->>'verification_status'='verified' and r->>'publication_status'='published'))
 order by u.id limit greatest(1,least(result_limit,1000)) offset greatest(0,least(result_offset,10000));
$$;
revoke all on function public.ranking_profiles(integer,integer) from public,anon,authenticated;
grant execute on function public.ranking_profiles(integer,integer) to anon,authenticated;
