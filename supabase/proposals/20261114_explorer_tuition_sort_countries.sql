-- PROPOSAL, not applied. Owner reviews and applies separately (see "Apply" below).
-- Supersedes and replaces (both deleted): supabase/proposals/explorer-tuition-sort-nov14.sql (notes)
-- and supabase/proposals/explorer-publisher-subjects-nov14.sql (its change is item 4 below).
-- Base: supabase/migrations/20261009013407_optimize_explorer_projection.sql, the latest
-- definition of public.explore_universities (no later migration redefines it).
-- Brings the hosted explorer in line with the bundled one (lib/research.ts filterUniversities,
-- server/tuition-index.ts). Same signature, LANGUAGE plpgsql STABLE SECURITY INVOKER,
-- search_path and owner; CREATE OR REPLACE keeps the existing
-- grant execute ... to anon,authenticated (20261003052843_hosted_catalogue_and_permissions.sql).
--
-- Changes (everything else is byte-identical to the base):
--   1. country accepts one ISO code or a comma list (UZ,KZ,KG,TJ,TM); compared upper-case.
--   2. tuition: new last coalesce branch, IPEDS out-of-state tuition from the
--      universities.imported_records jsonb column (source 'ipeds', metric 'tuition_out_of_state',
--      metric 'tuition_out_of_state' + 'fees_out_of_state', unit 'USD', verified + published,
--      summed within the latest reporting_year that has tuition). Same figure as the bundled
--      data/published/ipeds-fees-2023.json (IPEDS TUITION3+FEE3). Used by cost_max, the tuition
--      sorts and medianTuition.
--   3. sort=rank_the / rank_arwu: THE 2026 and ARWU 2026 Overall/Global rank, same shape as
--      qs_rank (verified ranking_entries, then profile_resources.rankings), nulls last, then name, id.
--   4. field (with no degree/language) also matches profile_resources.publisher_students.subjects,
--      as the bundled filter does (e.g. "computer science germany": 46 DE records have only
--      publisher subjects, 43 of them list Computer Science).
--
-- Rollback: re-run the CREATE OR REPLACE in
--   supabase/migrations/20261009013407_optimize_explorer_projection.sql
--
-- Apply (owner): move to supabase/migrations/20261114120000_explorer_tuition_sort_countries.sql
-- and run `supabase db push`, or paste into the Supabase SQL editor.
-- Check after: select explore_universities('{"country":"UZ,KZ"}'::jsonb,1)->'total';
--              select explore_universities('{"country":"DE","field":"Computer Science"}'::jsonb,1)->'total';
--              select explore_universities('{"sort":"rank_the"}'::jsonb,1)->'ids';

CREATE OR REPLACE FUNCTION public.explore_universities(filters jsonb DEFAULT '{}'::jsonb, page_number integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public', 'extensions'
AS $function$
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
select u.id,u.name,u.country_code,
 case when coalesce(filters->>'sort','rank') in ('rank','rank_desc','name') then coalesce((select r.rank from public.ranking_entries r join public.ranking_editions e on e.id=r.edition_id join public.ranking_providers p on p.id=e.provider_id where r.university_id=u.id and r.verification_status='verified' and p.slug='qs' and e.year=2027 and e.subject='Overall' and e.region='Global' order by r.rank nulls last limit 1),(select (r->>'rank')::integer from jsonb_array_elements(coalesce(u.profile_resources->'rankings','[]'::jsonb)) r where r->>'provider'='qs' and r->>'year'='2027' limit 1)) end qs_rank,
 case when filters->>'sort'='rank_the' then coalesce((select r.rank from public.ranking_entries r join public.ranking_editions e on e.id=r.edition_id join public.ranking_providers p on p.id=e.provider_id where r.university_id=u.id and r.verification_status='verified' and p.slug='the' and e.year=2026 and e.subject='Overall' and e.region='Global' order by r.rank nulls last limit 1),(select (r->>'rank')::integer from jsonb_array_elements(coalesce(u.profile_resources->'rankings','[]'::jsonb)) r where r->>'provider'='the' and r->>'year'='2026' limit 1)) end the_rank,
 case when filters->>'sort'='rank_arwu' then coalesce((select r.rank from public.ranking_entries r join public.ranking_editions e on e.id=r.edition_id join public.ranking_providers p on p.id=e.provider_id where r.university_id=u.id and r.verification_status='verified' and p.slug='arwu' and e.year=2026 and e.subject='Overall' and e.region='Global' order by r.rank nulls last limit 1),(select (r->>'rank')::integer from jsonb_array_elements(coalesce(u.profile_resources->'rankings','[]'::jsonb)) r where r->>'provider'='arwu' and r->>'year'='2026' limit 1)) end arwu_rank,
 coalesce((select value from (
   select a.acceptance_rate value,a.year,1 priority from public.admissions a where a.university_id=u.id and a.program_id is null and a.verification_status='verified' and a.acceptance_rate is not null
   union all select d.value,d.year,2 from public.data_points d where d.university_id=u.id and d.canonical and d.verification_status='verified' and d.metric='admission' and d.value is not null
   union all select (r->>'value')::numeric,(r->>'reporting_year')::integer,3 from jsonb_array_elements(coalesce(u.imported_records,'[]'::jsonb)) r where r->>'metric'='acceptance_rate' and jsonb_typeof(r->'value')='number' and r->>'reporting_year' is not null and r->>'verification_status'='verified' and r->>'publication_status'='published'
 ) observations order by year desc nulls last,priority limit 1),(u.profile_resources#>>'{discovery,admission}')::numeric) admission,
 coalesce((select c.amount from public.costs c where c.university_id=u.id and c.verification_status='verified' and c.program_id is null and c.category='tuition' and c.currency='USD' and c.period='year' and c.student_category='international' order by c.year desc nulls last limit 1),(u.profile_resources#>>'{discovery,tuition}')::numeric,
   (select sum((r->>'value')::numeric) from jsonb_array_elements(coalesce(u.imported_records,'[]'::jsonb)) r where r->>'source'='ipeds' and r->>'metric' in ('tuition_out_of_state','fees_out_of_state') and r->>'unit'='USD' and jsonb_typeof(r->'value')='number' and r->>'reporting_year' is not null and r->>'verification_status'='verified' and r->>'publication_status'='published' group by (r->>'reporting_year')::integer having bool_or(r->>'metric'='tuition_out_of_state') order by (r->>'reporting_year')::integer desc limit 1)) tuition,
 case when filters ? 'intl_min' or filters->>'sort' in ('international','international_asc') then coalesce((select d.value from public.data_points d where d.university_id=u.id and d.canonical and d.verification_status='verified' and d.metric='international_students' order by d.year desc nulls last limit 1),(u.profile_resources#>>'{discovery,international}')::numeric) end international,
 case when filters ? 'graduation_min' then coalesce((select d.value from public.data_points d where d.university_id=u.id and d.canonical and d.verification_status='verified' and d.metric='graduation_rate' order by d.year desc nulls last limit 1),(u.profile_resources#>>'{discovery,graduation}')::numeric) end graduation,
 case when coalesce(filters->>'aid','')<>'' then coalesce((select d.value from public.data_points d where d.university_id=u.id and d.canonical and d.verification_status='verified' and d.metric='aid_recipients' order by d.year desc nulls last limit 1),(u.profile_resources#>>'{discovery,aid}')::numeric) end aid,
 case when filters ? 'ielts_max' then coalesce((select r.minimum from public.requirements r where r.university_id=u.id and r.program_id is null and r.kind='IELTS' and r.verification_status='verified' and coalesce(r.evidence->>'university_wide','true')<>'false' order by r.year desc nulls last,r.verified_at desc limit 1),(select a.ielts_min from public.admissions a where a.university_id=u.id and a.program_id is null and a.verification_status='verified' order by a.year desc nulls last limit 1)) end ielts
from public.universities u where u.published and
 (coalesce(filters->>'q','')='' or not exists(select 1 from regexp_split_to_table(lower(trim(filters->>'q')), E'\\s+') term where term<>'' and lower(concat_ws(' ',u.name,u.short_name,u.city,u.region,u.country_code,u.profile_resources->>'country_name',u.aliases::text,u.profile_resources->'reported_programs')) not like '%'||term||'%')) and
 (coalesce(filters->>'country','')='' or u.country_code=any(string_to_array(upper(filters->>'country'),','))) and
 (coalesce(filters->>'region','')='' or u.region=filters->>'region') and
 (coalesce(filters->>'city','')='' or u.city ilike '%'||(filters->>'city')||'%') and
 (coalesce(filters->>'type','')='' or u.university_type=filters->>'type') and
 (coalesce(filters->>'scholarships','')='' or exists(select 1 from public.university_scholarships us join public.scholarships s on s.id=us.scholarship_id where us.university_id=u.id and s.published and s.verification_status='verified')) and
 ((coalesce(filters->>'field','')='' and coalesce(filters->>'degree','')='' and coalesce(filters->>'language','')='') or exists(
 select 1 from public.university_programs up join public.programs p on p.id=up.program_id where up.university_id=u.id and up.verification_status='verified'
 and (coalesce(filters->>'field','')='' or (p.name||' '||p.subject) ilike '%'||(filters->>'field')||'%')
 and (coalesce(filters->>'degree','')='' or p.degree_level=filters->>'degree')
 and (coalesce(filters->>'language','')='' or p.language=filters->>'language')) or (coalesce(filters->>'language','')='' and exists(select 1 from jsonb_array_elements(coalesce(u.profile_resources->'reported_programs','[]'::jsonb)) p where (coalesce(filters->>'field','')='' or p->>'name' ilike '%'||(filters->>'field')||'%') and (coalesce(filters->>'degree','')='' or p->>'level'=filters->>'degree')))
 -- a plain `field` filter also matches the publisher subject lists, as lib/research.ts filterUniversities does.
 or (coalesce(filters->>'degree','')='' and coalesce(filters->>'language','')='' and coalesce(filters->>'field','')<>'' and exists(select 1 from jsonb_array_elements_text(coalesce(u.profile_resources#>'{publisher_students,subjects}','[]'::jsonb)) subject where subject ilike '%'||(filters->>'field')||'%')))
), matched as (
 select * from facts u where
 (not filters ? 'cost_max' or tuition<=(filters->>'cost_max')::numeric) and
 (not filters ? 'admission_min' or admission>=(filters->>'admission_min')::numeric) and
 (not filters ? 'admission_max' or admission<=(filters->>'admission_max')::numeric) and
 (not filters ? 'ielts_max' or ielts<=(filters->>'ielts_max')::numeric) and
 (not filters ? 'intl_min' or international>=(filters->>'intl_min')::numeric) and
 (not filters ? 'graduation_min' or graduation>=(filters->>'graduation_min')::numeric) and
 (coalesce(filters->>'aid','')='' or aid>0)
), page as (
select id from matched order by case when coalesce(filters->>'sort','rank') in ('rank','name') then qs_rank end asc nulls last,case when filters->>'sort'='rank_desc' then qs_rank end desc nulls last,case when filters->>'sort'='admission_desc' then admission end desc nulls last,case when filters->>'sort'='international_asc' then international end asc nulls last,case when filters->>'sort'='tuition' then tuition end asc nulls last,case when filters->>'sort'='tuition_desc' then tuition end desc nulls last,case when filters->>'sort'='admission' then admission end asc nulls last,case when filters->>'sort'='international' then international end desc nulls last,case when filters->>'sort'='rank_the' then the_rank end asc nulls last,case when filters->>'sort'='rank_arwu' then arwu_rank end asc nulls last,name,id limit 24 offset greatest(0,least(page_number-1,9999))*24)
select jsonb_build_object('ids',coalesce((select jsonb_agg(id) from page),'[]'),'total',(select count(*) from matched),'medianTuition',(select percentile_cont(.5) within group(order by tuition) from matched),'medianAdmission',(select percentile_cont(.5) within group(order by admission) from matched),'countries',(select count(distinct country_code) from matched)));
end $function$

