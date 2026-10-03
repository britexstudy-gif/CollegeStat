-- Preserve sourced profile libraries in hosted mode; normalized tables remain canonical.
alter table public.universities add column profile_resources jsonb not null default '{}'::jsonb
  check(jsonb_typeof(profile_resources)='object');
alter table public.universities drop constraint if exists universities_logo_url_check;
alter table public.universities add constraint universities_logo_url_check check(logo_url ~ '^https://' or logo_url ~ '^/logos/[a-zA-Z0-9/_.-]+$');
alter table public.media drop constraint if exists media_url_check;
alter table public.media add constraint media_url_check check(url ~ '^https://' or url ~ '^/images/[a-zA-Z0-9/_.-]+$' or url ~ '^/logos/[a-zA-Z0-9/_.-]+$');

-- Hosted projects grant function execution to API roles by default. PUBLIC-only
-- revocation is insufficient there. Close defaults and explicitly restore the API.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.profiles where id=(select auth.uid()) and role='admin');
$$;
revoke all on function private.is_admin() from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated, service_role;
create or replace function public.is_admin() returns boolean language sql stable security invoker set search_path='' as $$ select private.is_admin() $$;
grant execute on function public.is_admin() to authenticated, service_role;

grant execute on function public.search_universities(text,integer),public.explore_universities(jsonb,integer),public.read_shared_comparison(uuid) to anon,authenticated;
grant execute on function public.save_comparison(uuid[],text),public.approve_observation(uuid),public.reject_observation(uuid),public.verify_record(text,uuid),public.consume_admin_limit(),public.retry_ingestion_job(uuid),public.stage_observations(uuid,jsonb,uuid,uuid),public.stage_institution_candidates(jsonb,text),public.review_institution_candidate(uuid,boolean,uuid) to authenticated;
grant execute on function public.consume_rate_limit(text,integer,integer),public.enqueue_due_feeds(),public.claim_ingestion_job(),public.fail_ingestion_job(uuid,uuid,text),public.stage_observations(uuid,jsonb,uuid,uuid) to service_role;

-- Keep extension objects outside the exposed API schema.
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;
grant usage on schema extensions to anon,authenticated,service_role;
grant execute on function extensions.similarity(text,text) to anon,authenticated,service_role;
alter function public.search_universities(text,integer) set search_path=public,extensions;

-- Auth identity and staff membership are fixed within each statement, not per row.
do $$ declare p record; clauses text; begin
  for p in select * from pg_policies where schemaname='public' loop
    clauses='';
    if p.qual is not null then clauses=clauses||' using ('||replace(replace(p.qual,'auth.uid()','(select auth.uid())'),'public.is_admin()','(select public.is_admin())')||')'; end if;
    if p.with_check is not null then clauses=clauses||' with check ('||replace(replace(p.with_check,'auth.uid()','(select auth.uid())'),'public.is_admin()','(select public.is_admin())')||')'; end if;
    if clauses<>'' then execute format('alter policy %I on public.%I%s',p.policyname,p.tablename,clauses); end if;
  end loop;
end $$;

-- One SELECT policy per role avoids evaluating overlapping public/staff policies.
do $$ declare p record; public_qual text; begin
  for p in select * from pg_policies where schemaname='public' and policyname='admin_all' loop
    select qual into public_qual from pg_policies where schemaname='public' and tablename=p.tablename and policyname='public_read';
    if public_qual is null then continue; end if;
    execute format('drop policy admin_all on public.%I',p.tablename);
    execute format('drop policy public_read on public.%I',p.tablename);
    execute format('create policy public_read on public.%I for select to anon using (%s)',p.tablename,public_qual);
    execute format('create policy member_read on public.%I for select to authenticated using ((select public.is_admin()) or (%s))',p.tablename,public_qual);
    execute format('create policy admin_insert on public.%I for insert to authenticated with check ((select public.is_admin()))',p.tablename);
    execute format('create policy admin_update on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',p.tablename);
    execute format('create policy admin_delete on public.%I for delete to authenticated using ((select public.is_admin()))',p.tablename);
  end loop;
  for p in select * from pg_policies where schemaname='public' and policyname='admin_write' loop
    execute format('drop policy admin_write on public.%I',p.tablename);
    execute format('create policy admin_insert on public.%I for insert to authenticated with check ((select public.is_admin()))',p.tablename);
    execute format('create policy admin_update on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',p.tablename);
    execute format('create policy admin_delete on public.%I for delete to authenticated using ((select public.is_admin()))',p.tablename);
  end loop;
end $$;

-- Cover foreign keys for joins, content review and deletion without redundant indexes.
do $$ declare fk record; columns_sql text; begin
  for fk in select c.conrelid,c.conkey,c.conname,t.relname from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where c.contype='f' and n.nspname='public' loop
    if exists(select 1 from pg_index i where i.indrelid=fk.conrelid and i.indisvalid and i.indpred is null and array(select key from unnest(i.indkey) with ordinality keys(key,n) where n<=cardinality(fk.conkey))=fk.conkey) then continue; end if;
    select string_agg(quote_ident(a.attname),',' order by k.ordinality) into columns_sql from unnest(fk.conkey) with ordinality k(attnum,ordinality) join pg_attribute a on a.attrelid=fk.conrelid and a.attnum=k.attnum;
    execute format('create index if not exists %I on public.%I (%s)',left(fk.conname||'_lookup',63),fk.relname,columns_sql);
  end loop;
end $$;
