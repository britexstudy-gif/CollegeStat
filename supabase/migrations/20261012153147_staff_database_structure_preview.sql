-- Review-only metadata function. Apply through the hosted migration ledger after
-- independent root review. No table, row, existing policy or table grant changes.
-- The helper stays in the existing private schema; the Data API wrapper is invoker.
create or replace function private.admin_database_structure_snapshot()
returns jsonb language plpgsql stable security definer set search_path=''
as $structure$
declare
  actor uuid := (select auth.uid());
  allowed constant text[] := array[
    'countries','cities','universities','university_aliases','campuses',
    'programs','university_programs','admissions','costs','requirements',
    'deadlines','financial_aid','scholarships','university_scholarships',
    'ranking_sources','external_rankings','ranking_providers','ranking_editions',
    'ranking_entries','national_ranking_editions','national_ranking_entries',
    'research_metrics','outcomes','departments','professors','research','media',
    'external_identifiers','institution_candidates','data_sources','data_points',
    'data_imports','source_records','data_quality_checks','verification_logs',
    'audit_logs','ingestion_feeds','ingestion_jobs','stale_evidence',
    'learning_resources','support_requests','exchange_rates','profiles','saved_universities',
    'saved_scholarships','comparison_lists','shared_comparisons','saved_searches',
    'user_lists','user_list_items','user_notes','user_checklist','research_history',
    'notifications','writing_draft_versions','student_education','student_test_attempts',
    'university_admissions','university_requirements','university_deadlines',
    'university_costs','university_rankings','university_identifiers'
  ];
  result jsonb;
begin
  if actor is null or not public.is_admin() then
    raise exception 'Administrator required' using errcode='42501';
  end if;
  if coalesce((select auth.jwt()->>'aal'),'') <> 'aal2' or public.admin_session_status()->>'active' is distinct from 'true' then
    raise exception 'Verified staff session required' using errcode='42501';
  end if;

  select pg_catalog.jsonb_build_object(
    'schema','public',
    'scope','allowlisted_application_metadata',
    'checked_at',pg_catalog.statement_timestamp(),
    'tables',coalesce(pg_catalog.jsonb_agg(t.info order by t.name),'[]'::jsonb)
  ) into result
  from (
    select c.relname as name, pg_catalog.jsonb_build_object(
      'schema','public','name',c.relname,
      'kind',case c.relkind when 'r' then 'table' when 'p' then 'partitioned_table' when 'v' then 'view' else 'materialized_view' end,
      'rls_enabled',c.relrowsecurity,'rls_forced',c.relforcerowsecurity,
      'security_invoker',case when c.relkind='v' then 'security_invoker=true'=any(coalesce(c.reloptions,array[]::text[])) else null end,
      'columns',coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'name',a.attname,'type',pg_catalog.format_type(a.atttypid,a.atttypmod),
          'nullable',not a.attnotnull,
          'has_default',a.atthasdef or a.attidentity<>'',
          'primary_key',exists(select 1 from pg_catalog.pg_constraint pk where pk.conrelid=c.oid and pk.contype='p' and a.attnum=any(pk.conkey))
        ) order by a.attnum)
        from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
      ),'[]'::jsonb),
      'foreign_keys',coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'name',fk.conname,
          'columns',(select pg_catalog.jsonb_agg(ca.attname order by k.ordinality) from pg_catalog.unnest(fk.conkey) with ordinality k(attnum,ordinality) join pg_catalog.pg_attribute ca on ca.attrelid=c.oid and ca.attnum=k.attnum),
          'target_schema',tn.nspname,'target_table',tc.relname,
          'target_columns',(select pg_catalog.jsonb_agg(ta.attname order by k.ordinality) from pg_catalog.unnest(fk.confkey) with ordinality k(attnum,ordinality) join pg_catalog.pg_attribute ta on ta.attrelid=tc.oid and ta.attnum=k.attnum)
        ) order by fk.conname)
        from pg_catalog.pg_constraint fk
        join pg_catalog.pg_class tc on tc.oid=fk.confrelid
        join pg_catalog.pg_namespace tn on tn.oid=tc.relnamespace
        where fk.conrelid=c.oid and fk.contype='f'
          and ((tn.nspname='public' and tc.relname=any(allowed)) or (tn.nspname='auth' and tc.relname='users'))
      ),'[]'::jsonb),
      'policies',coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'name',p.policyname,'command',p.cmd,'roles',p.roles,
          'permissive',p.permissive='PERMISSIVE'
        ) order by p.policyname)
        from pg_catalog.pg_policies p where p.schemaname='public' and p.tablename=c.relname
      ),'[]'::jsonb)
    ) as info
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname=any(allowed) and c.relkind in ('r','p','v','m')
  ) t;
  if pg_catalog.octet_length(result::text)>262144 then
    raise exception 'Structure metadata exceeded preview limit' using errcode='54000';
  end if;
  return result;
end;
$structure$;
revoke all on function private.admin_database_structure_snapshot() from public, anon, authenticated, service_role;
grant execute on function private.admin_database_structure_snapshot() to authenticated;

create or replace function public.admin_database_structure()
returns jsonb language sql stable security invoker set search_path=''
as $structure$ select private.admin_database_structure_snapshot() $structure$;
revoke all on function public.admin_database_structure() from public, anon, authenticated, service_role;
grant execute on function public.admin_database_structure() to authenticated;
comment on function public.admin_database_structure() is 'AAL2 administrator-only allowlisted structure metadata. No rows, policy expressions, default values, SQL execution or credentials.';
