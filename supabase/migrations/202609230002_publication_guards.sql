-- Separate published canonical facts from raw observations and unreviewed drafts.
alter table public.data_points add column canonical boolean not null default true;
drop policy public_read on public.data_points;
create policy public_read on public.data_points for select to anon,authenticated using(canonical and verification_status='verified' and source_id is not null and exists(select 1 from public.universities u where u.id=university_id and u.published));
drop policy public_read on public.admissions;
create policy public_read on public.admissions for select to anon,authenticated using(verification_status='verified' and source_id is not null and exists(select 1 from public.universities u where u.id=university_id and u.published));
drop policy public_read on public.costs;
create policy public_read on public.costs for select to anon,authenticated using(verification_status='verified' and source_id is not null and exists(select 1 from public.universities u where u.id=university_id and u.published));
drop policy public_read on public.scholarships;
create policy public_read on public.scholarships for select to anon,authenticated using(published and verification_status='verified' and source_id is not null);
-- Preserve audit history when its actor deletes their account.
alter table public.audit_logs drop constraint audit_logs_actor_id_fkey;
alter table public.audit_logs add foreign key(actor_id) references auth.users on delete set null;
alter table public.verification_logs drop constraint verification_logs_actor_id_fkey;
alter table public.verification_logs add foreign key(actor_id) references auth.users on delete set null;
alter table public.data_imports drop constraint data_imports_created_by_fkey;
alter table public.data_imports add foreign key(created_by) references auth.users on delete set null;
create or replace function public.approve_observation(observation_id uuid) returns void language plpgsql security definer set search_path='' as $$ declare r public.source_records; begin
 if not public.is_admin() then raise exception 'Administrator required'; end if;
 select * into r from public.source_records where id=observation_id for update;
 if r.id is null or r.status not in ('pending','conflicting') or r.university_id is null or r.normalized_value is null then raise exception 'Observation cannot be approved'; end if;
 -- Serializes concurrent approvals of the same university/metric/year.
 perform pg_advisory_xact_lock(hashtextextended(r.university_id::text||r.metric||r.year::text,0));
 update public.data_points set canonical=false where university_id=r.university_id and metric=r.metric and year=r.year and canonical;
 insert into public.data_points(university_id,metric,year,value,unit,source_id,verification_status,verified_at,confidence,notes,canonical) values(r.university_id,r.metric,r.year,r.normalized_value,r.unit,r.source_id,'verified',now(),r.confidence,concat_ws(' ',r.notes,'Observation URL: '||r.source_url),true)
 on conflict(university_id,metric,year,source_id) do update set value=excluded.value,unit=excluded.unit,canonical=true,verification_status='verified',verified_at=now(),notes=excluded.notes;
 update public.source_records set status='approved' where id=r.id;
 insert into public.verification_logs(entity_table,entity_id,actor_id,status) values('source_records',r.id,auth.uid(),'approved'); end $$;
-- PostgreSQL + auth gateway enforce authentication rate limits; search remains bounded.
revoke all on function public.save_comparison(uuid[],text) from public;
grant execute on function public.save_comparison(uuid[],text) to authenticated;
revoke all on function public.approve_observation(uuid) from public;
grant execute on function public.approve_observation(uuid) to authenticated;
-- Verification metadata is written by a role-checked RPC, alongside a log.
create function public.verify_record(entity text, record_id uuid) returns void language plpgsql security definer set search_path='' as $$ declare sourced uuid; begin
 if not public.is_admin() then raise exception 'Administrator required'; end if;
 if entity not in ('admissions','costs','data_points','ranking_entries','scholarships') then raise exception 'Unsupported verification entity'; end if;
 execute format('select source_id from public.%I where id=$1 for update',entity) into sourced using record_id;
 if sourced is null then raise exception 'A source is required before verification'; end if;
 execute format('update public.%I set verification_status=''verified'',verified_at=now() where id=$1',entity) using record_id;
 insert into public.verification_logs(entity_table,entity_id,actor_id,status) values(entity,record_id,auth.uid(),'verified'); end $$;
revoke all on function public.verify_record(text,uuid) from public;
grant execute on function public.verify_record(text,uuid) to authenticated;
