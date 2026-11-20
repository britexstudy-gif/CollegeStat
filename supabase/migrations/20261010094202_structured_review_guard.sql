-- Keep scoped costs and deadlines out of generic numeric publication. Existing signature, grants and ordinary review remain.
create or replace function public.approve_observation(observation_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.source_records; begin
 if not public.is_admin() then raise exception 'Administrator required'; end if;
 select * into r from public.source_records where id=observation_id for update;
 if r.id is null or r.status not in ('pending','conflicting') or r.university_id is null or r.normalized_value is null then raise exception 'Observation cannot be approved'; end if;
 if r.raw_value ? 'target_table' and r.raw_value->>'target_table' is distinct from 'data_points' then raise exception 'Structured observations require a section-specific review workflow' using errcode='22023'; end if;
 if r.metric like 'ranking:%' then raise exception 'Ranking observations require a dedicated ranking review workflow' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(r.university_id::text||r.metric||r.year::text,0));
 update public.data_points set canonical=false where university_id=r.university_id and metric=r.metric and year=r.year and canonical;
 insert into public.data_points(university_id,metric,year,value,unit,source_id,source_url,observation_id,verification_status,verified_at,confidence,notes,canonical,evidence)
 values(r.university_id,r.metric,r.year,r.normalized_value,r.unit,r.source_id,r.source_url,r.id,'verified',now(),r.confidence,r.notes,true,coalesce(r.raw_value->'evidence','{}'::jsonb));
 update public.source_records set status='approved' where id=r.id;
 insert into public.verification_logs(entity_table,entity_id,actor_id,status) values('source_records',r.id,auth.uid(),'approved');
end $$;

