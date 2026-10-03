-- Durable jobs. Workers can only stage observations; approval remains a human admin action.
create table public.ingestion_feeds(
 id uuid primary key default gen_random_uuid(), source_id uuid not null references public.data_sources,
 name text not null, adapter text not null check(adapter in ('collegestat-json','scorecard')),
 url text not null check(url ~ '^https://'), enabled boolean not null default false,
 interval_hours integer not null default 168 check(interval_hours between 1 and 8760),
 next_run_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create table public.ingestion_jobs(
 id uuid primary key default gen_random_uuid(), feed_id uuid not null references public.ingestion_feeds,
 status text not null default 'queued' check(status in ('queued','running','review','failed')),
 attempts integer not null default 0 check(attempts between 0 and 5), available_at timestamptz not null default now(),
 lease_token uuid, lease_until timestamptz, import_id uuid references public.data_imports,
 error_code text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index one_active_feed_job on public.ingestion_jobs(feed_id) where status in ('queued','running');
create index on public.ingestion_jobs(status,available_at);
create table public.external_identifiers(
 id uuid not null default gen_random_uuid() unique,
 university_id uuid not null references public.universities on delete cascade,
 system text not null check(system in ('ipeds','ror','wikidata')), external_id text not null,
 primary key(system,external_id), unique(university_id,system)
);
alter table public.ingestion_feeds enable row level security;
alter table public.ingestion_jobs enable row level security;
alter table public.external_identifiers enable row level security;
grant select,insert,update,delete on public.ingestion_feeds,public.external_identifiers to authenticated;
grant select on public.ingestion_jobs to authenticated;
grant select on public.ingestion_feeds,public.external_identifiers to service_role;
create policy admin_all on public.ingestion_feeds for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy admin_all on public.external_identifiers for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy admin_read on public.ingestion_jobs for select to authenticated using(public.is_admin());
create trigger audit_changes after insert or update or delete on public.ingestion_feeds for each row execute function public.audit_content();
create trigger audit_changes after insert or update or delete on public.external_identifiers for each row execute function public.audit_content();

create function public.enqueue_due_feeds() returns integer language plpgsql security definer set search_path='' as $$
declare f public.ingestion_feeds; n integer:=0; begin
 for f in select * from public.ingestion_feeds where enabled and next_run_at<=now() for update skip locked loop
 insert into public.ingestion_jobs(feed_id) values(f.id) on conflict do nothing;
 update public.ingestion_feeds set next_run_at=now()+make_interval(hours=>f.interval_hours) where id=f.id;
 n:=n+1;
 end loop; return n;
end $$;
create function public.claim_ingestion_job() returns public.ingestion_jobs language plpgsql security definer set search_path='' as $$
declare j public.ingestion_jobs; begin
 update public.ingestion_jobs set status='failed',error_code='lease_exhausted',updated_at=now() where status='running' and lease_until<now() and attempts>=5;
 select * into j from public.ingestion_jobs where attempts<5 and
 ((status='queued' and available_at<=now()) or (status='running' and lease_until<now())) order by available_at,id for update skip locked limit 1;
 if j.id is null then return null; end if;
 update public.ingestion_jobs set status='running',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',updated_at=now() where id=j.id returning * into j;
 return j;
end $$;
create function public.fail_ingestion_job(job_id uuid, token uuid, code text) returns void language plpgsql security definer set search_path='' as $$ begin
 update public.ingestion_jobs set status=case when attempts>=5 then 'failed' else 'queued' end,
 available_at=now()+make_interval(secs=>least(3600,30*power(2,attempts)::integer)),
 lease_token=null,lease_until=null,error_code=left(code,80),updated_at=now()
 where id=job_id and status='running' and lease_token=token and lease_until>now();
 if not found then raise exception 'Lease expired'; end if;
end $$;
-- Shared staging transaction: strict validation, idempotent observations, quality flags, rollback on failure.
create function public.stage_observations(source uuid, rows jsonb, job_id uuid default null, token uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare batch uuid; v jsonb; u uuid; y integer; amount numeric; obs uuid; prev numeric; n integer:=0; duplicates integer:=0; role_name text; begin
 role_name:=current_setting('role',true);
 if not public.is_admin() and role_name<>'service_role' then raise exception 'Administrator required'; end if;
 if rows is null or jsonb_typeof(rows)<>'array' or jsonb_array_length(rows) not between 1 and 500 then raise exception 'Expected 1 to 500 observations'; end if;
 if job_id is not null then
 perform 1 from public.ingestion_jobs j join public.ingestion_feeds f on f.id=j.feed_id
 where j.id=job_id and j.status='running' and j.lease_token=token and j.lease_until>now() and f.source_id=source for update of j;
 if not found then raise exception 'Lease expired or source mismatch'; end if;
 elsif role_name='service_role' then raise exception 'Worker lease required'; end if;
 insert into public.data_imports(source_id,created_by,status,records_seen) values(source,auth.uid(),'pending',jsonb_array_length(rows)) returning id into batch;
 for v in select value from jsonb_array_elements(rows) loop
 if jsonb_typeof(v)<>'object' or jsonb_typeof(v->'value') is distinct from 'number' or jsonb_typeof(v->'year') is distinct from 'number'
 or not (coalesce(v->>'metric','') ~ '^[a-z][a-z0-9_]{0,79}$') or not (coalesce(v->>'source_url','') ~ '^https://')
 or length(v->>'source_url')>2048 or length(coalesce(v->>'notes',''))>5000 or length(coalesce(v->>'unit',''))>40 then raise exception 'Invalid observation'; end if;
 u:=(v->>'university_id')::uuid; y:=(v->>'year')::integer; amount:=(v->>'value')::numeric;
 if u is null or y not between 1900 and 2100 or (v->>'year')::numeric<>y or amount<0 or amount>1e12 or (v->>'unit'='%' and amount>100) then raise exception 'Observation outside bounds'; end if;
 select value into prev from public.data_points where university_id=u and metric=v->>'metric' and year=y and canonical limit 1;
 insert into public.source_records(import_id,source_id,university_id,metric,year,raw_value,normalized_value,unit,source_url,notes,status)
 values(batch,source,u,v->>'metric',y,v,amount,v->>'unit',v->>'source_url',v->>'notes',case when prev is not null and prev<>amount then 'conflicting' else 'pending' end)
 on conflict(fingerprint) do nothing returning id into obs;
 if obs is null then duplicates:=duplicates+1; else
 n:=n+1;
 if prev is not null and prev<>amount then insert into public.data_quality_checks(record_id,severity,message) values(obs,'warning','A canonical value already exists for this metric and year. Review the source and population before replacing it.'); end if;
 end if;
 end loop;
 update public.data_imports set status='review',created=n,completed_at=now(),warnings=jsonb_build_array(duplicates::text||' duplicate observations skipped') where id=batch;
 if job_id is not null then update public.ingestion_jobs set status='review',import_id=batch,lease_token=null,lease_until=null,error_code=null,updated_at=now() where id=job_id; end if;
 return jsonb_build_object('import_id',batch,'accepted',n,'rejected',0,'duplicates',duplicates,'warnings',jsonb_build_array(duplicates::text||' duplicate observations skipped'));
end $$;
create function public.retry_ingestion_job(job_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'Administrator required'; end if;
 update public.ingestion_jobs set status='queued',attempts=0,available_at=now(),error_code=null,updated_at=now() where id=job_id and status='failed';
 if not found then raise exception 'Only failed jobs can be retried'; end if;
end $$;
revoke all on function public.enqueue_due_feeds(),public.claim_ingestion_job(),public.fail_ingestion_job(uuid,uuid,text),public.stage_observations(uuid,jsonb,uuid,uuid),public.retry_ingestion_job(uuid) from public;
grant execute on function public.enqueue_due_feeds(),public.claim_ingestion_job(),public.fail_ingestion_job(uuid,uuid,text),public.stage_observations(uuid,jsonb,uuid,uuid) to service_role;
grant execute on function public.stage_observations(uuid,jsonb,uuid,uuid),public.retry_ingestion_job(uuid) to authenticated;
create view public.stale_evidence with(security_invoker=true) as
 select d.id,d.university_id,d.metric,d.year,d.verified_at,d.source_id,s.url source_url
 from public.data_points d join public.data_sources s on s.id=d.source_id
 where d.canonical and (d.verified_at<now()-interval '1 year' or d.verification_status<>'verified');
grant select on public.stale_evidence to authenticated;
