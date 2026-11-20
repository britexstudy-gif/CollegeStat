-- Generic numeric review must not publish staged ranking positions. Preserve the
-- existing RPC signatures, security settings and grants with CREATE OR REPLACE.
create or replace function public.approve_observation(observation_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.source_records; begin
 if not public.is_admin() then raise exception 'Administrator required'; end if;
 select * into r from public.source_records where id=observation_id for update;
 if r.id is null or r.status not in ('pending','conflicting') or r.university_id is null or r.normalized_value is null then raise exception 'Observation cannot be approved'; end if;
 if r.metric like 'ranking:%' then raise exception 'Ranking observations require a dedicated ranking review workflow' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(r.university_id::text||r.metric||r.year::text,0));
 update public.data_points set canonical=false where university_id=r.university_id and metric=r.metric and year=r.year and canonical;
 insert into public.data_points(university_id,metric,year,value,unit,source_id,source_url,observation_id,verification_status,verified_at,confidence,notes,canonical,evidence)
 values(r.university_id,r.metric,r.year,r.normalized_value,r.unit,r.source_id,r.source_url,r.id,'verified',now(),r.confidence,r.notes,true,coalesce(r.raw_value->'evidence','{}'::jsonb));
 update public.source_records set status='approved' where id=r.id;
 insert into public.verification_logs(entity_table,entity_id,actor_id,status) values('source_records',r.id,auth.uid(),'approved');
end $$;

create or replace function public.verify_record(entity text, record_id uuid) returns void language plpgsql security definer set search_path='' as $$ declare sourced uuid; begin
 if not public.is_admin() then raise exception 'Administrator required'; end if;
 if entity not in ('admissions','costs','data_points','ranking_entries','scholarships','departments','professors','research','deadlines','requirements','financial_aid','media','university_programs') then raise exception 'Unsupported verification entity'; end if;
 execute format('select source_id from public.%I where id=$1 for update',entity) into sourced using record_id;
 if sourced is null then raise exception 'A source is required before verification'; end if;
 -- Staging shares entry IDs with observations; older imports may only share
 -- university, source and reporting year. Even an already approved source row
 -- requires ranking review rather than bypassing its scope/edition checks.
 if entity='ranking_entries' and exists(
  select 1 from public.ranking_entries e
  join public.ranking_editions edition on edition.id=e.edition_id
  join public.source_records r on r.metric like 'ranking:%' and
   (r.id=e.id or (r.university_id=e.university_id and r.source_id=e.source_id and r.year=coalesce(e.year,edition.year)))
  where e.id=record_id
 ) then raise exception 'Staged ranking entries require a dedicated ranking review workflow' using errcode='22023'; end if;
 execute format('update public.%I set verification_status=''verified'',verified_at=now() where id=$1',entity) using record_id;
 insert into public.verification_logs(entity_table,entity_id,actor_id,status) values(entity,record_id,auth.uid(),'verified'); end $$;
