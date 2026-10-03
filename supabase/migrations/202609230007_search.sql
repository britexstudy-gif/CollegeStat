create or replace function public.explore_universities(filters jsonb default '{}', page_number integer default 1) returns jsonb language plpgsql stable security invoker set search_path=public as $$
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
 coalesce((select a.acceptance_rate from public.admissions a where a.university_id=u.id and a.program_id is null and a.verification_status='verified' order by a.year desc nulls last limit 1),(select d.value from public.data_points d where d.university_id=u.id and d.canonical and d.verification_status='verified' and d.metric='admission' order by d.year desc nulls last limit 1)) admission,
 (select c.amount from public.costs c where c.university_id=u.id and c.verification_status='verified' and c.program_id is null and c.category='tuition' and c.currency='USD' and c.period='year' and c.student_category='international' order by c.year desc nulls last limit 1) tuition,
 (select d.value from public.data_points d where d.university_id=u.id and d.canonical and d.verification_status='verified' and d.metric='international_students' order by d.year desc nulls last limit 1) international,
 (select d.value from public.data_points d where d.university_id=u.id and d.canonical and d.verification_status='verified' and d.metric='graduation_rate' order by d.year desc nulls last limit 1) graduation,
 (select d.value from public.data_points d where d.university_id=u.id and d.canonical and d.verification_status='verified' and d.metric='aid_recipients' order by d.year desc nulls last limit 1) aid,
 coalesce((select r.minimum from public.requirements r where r.university_id=u.id and r.program_id is null and r.kind='IELTS' and r.verification_status='verified' order by r.year desc nulls last,r.verified_at desc limit 1),(select a.ielts_min from public.admissions a where a.university_id=u.id and a.program_id is null and a.verification_status='verified' order by a.year desc nulls last limit 1)) ielts
from public.universities u where u.published), matched as (
 select * from facts u where
 (coalesce(filters->>'q','')='' or u.name ilike '%'||(filters->>'q')||'%' or u.city ilike '%'||(filters->>'q')||'%' or u.short_name ilike '%'||(filters->>'q')||'%' or exists(select 1 from public.university_aliases a where a.university_id=u.id and a.alias ilike '%'||(filters->>'q')||'%')) and
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
 and (coalesce(filters->>'language','')='' or p.language=filters->>'language')))
), page as (
select id from matched order by case when filters->>'sort'='tuition' then tuition end asc nulls last,case when filters->>'sort'='tuition_desc' then tuition end desc nulls last,case when filters->>'sort'='admission' then admission end asc nulls last,case when filters->>'sort'='international' then international end desc nulls last,name,id limit 24 offset greatest(0,least(page_number-1,9999))*24)
select jsonb_build_object('ids',coalesce((select jsonb_agg(id) from page),'[]'),'total',(select count(*) from matched),'medianTuition',(select percentile_cont(.5) within group(order by tuition) from matched),'medianAdmission',(select percentile_cont(.5) within group(order by admission) from matched),'countries',(select count(distinct country_code) from matched)));
end $$;
