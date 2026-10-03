-- Evidence-bearing entities. Drafts are never public; all relationships retain provenance.
alter table public.universities add column admissions_url text check(admissions_url ~ '^https://');
alter table public.data_points add column source_url text check(source_url ~ '^https://');
alter table public.data_points add column observation_id uuid references public.source_records;
alter table public.source_records add column fingerprint text generated always as (md5(source_id::text || coalesce(university_id::text,'') || metric || year::text || raw_value::text || source_url)) stored;
create unique index source_record_dedup on public.source_records(fingerprint);
-- Keep every approved revision, including corrections from the same source.
alter table public.data_points drop constraint data_points_university_id_metric_year_source_id_key;
create unique index one_canonical_fact on public.data_points(university_id,metric,year) nulls not distinct where canonical;
drop policy public_read on public.ranking_entries;
create policy public_read on public.ranking_entries for select to anon,authenticated using(
 verification_status='verified' and source_id is not null and
 exists(select 1 from public.universities u where u.id=university_id and u.published) and
 exists(select 1 from public.ranking_editions e join public.ranking_providers p on p.id=e.provider_id where e.id=edition_id and e.permitted and p.license_status='permitted'));

create table public.departments(id uuid primary key default gen_random_uuid(),
 university_id uuid not null references public.universities on delete cascade,
 source_id uuid not null references public.data_sources,
 source_url text not null check(source_url ~ '^https://'),
 year integer check(year between 1900 and 2100),
 verification_status text not null default 'needs_review' check(verification_status in ('verified','needs_review','outdated','missing_source')),
 verified_at timestamptz, notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(verification_status<>'verified' or verified_at is not null),
 name text not null, official_url text not null check(official_url ~ '^https://'), unique(university_id,name), unique(id,university_id));
alter table public.departments enable row level security;
grant select on public.departments to anon;
grant select,insert,update,delete on public.departments to authenticated;
create policy admin_all on public.departments for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_read on public.departments for select to anon,authenticated using(verification_status='verified'  and exists(select 1 from public.universities u where u.id=university_id and u.published));
create index on public.departments(university_id);
create trigger audit_changes after insert or update or delete on public.departments for each row execute function public.audit_content();
create trigger updated_at before update on public.departments for each row execute function public.touch_updated_at();

create table public.professors(id uuid primary key default gen_random_uuid(),
 university_id uuid not null references public.universities on delete cascade,
 source_id uuid not null references public.data_sources,
 source_url text not null check(source_url ~ '^https://'),
 year integer check(year between 1900 and 2100),
 verification_status text not null default 'needs_review' check(verification_status in ('verified','needs_review','outdated','missing_source')),
 verified_at timestamptz, notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(verification_status<>'verified' or verified_at is not null),
 name text not null, title text, department_id uuid, research_areas text[] not null default '{}', profile_url text not null check(profile_url ~ '^https://'), biography text, unique(university_id,profile_url), foreign key(department_id,university_id) references public.departments(id,university_id));
alter table public.professors enable row level security;
grant select on public.professors to anon;
grant select,insert,update,delete on public.professors to authenticated;
create policy admin_all on public.professors for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_read on public.professors for select to anon,authenticated using(verification_status='verified'  and exists(select 1 from public.universities u where u.id=university_id and u.published));
create index on public.professors(university_id);
create trigger audit_changes after insert or update or delete on public.professors for each row execute function public.audit_content();
create trigger updated_at before update on public.professors for each row execute function public.touch_updated_at();

create table public.research(id uuid primary key default gen_random_uuid(),
 university_id uuid not null references public.universities on delete cascade,
 source_id uuid not null references public.data_sources,
 source_url text not null check(source_url ~ '^https://'),
 year integer check(year between 1900 and 2100),
 verification_status text not null default 'needs_review' check(verification_status in ('verified','needs_review','outdated','missing_source')),
 verified_at timestamptz, notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(verification_status<>'verified' or verified_at is not null),
 title text not null, department_id uuid, research_areas text[] not null default '{}', summary text, official_url text not null check(official_url ~ '^https://'), unique(university_id,official_url), foreign key(department_id,university_id) references public.departments(id,university_id));
alter table public.research enable row level security;
grant select on public.research to anon;
grant select,insert,update,delete on public.research to authenticated;
create policy admin_all on public.research for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_read on public.research for select to anon,authenticated using(verification_status='verified'  and exists(select 1 from public.universities u where u.id=university_id and u.published));
create index on public.research(university_id);
create trigger audit_changes after insert or update or delete on public.research for each row execute function public.audit_content();
create trigger updated_at before update on public.research for each row execute function public.touch_updated_at();

create table public.deadlines(id uuid primary key default gen_random_uuid(),
 university_id uuid not null references public.universities on delete cascade,
 source_id uuid not null references public.data_sources,
 source_url text not null check(source_url ~ '^https://'),
 year integer check(year between 1900 and 2100),
 verification_status text not null default 'needs_review' check(verification_status in ('verified','needs_review','outdated','missing_source')),
 verified_at timestamptz, notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(verification_status<>'verified' or verified_at is not null),
 title text not null, program_id uuid references public.programs, student_category text not null, cycle text not null, due_at timestamptz not null, timezone text not null, application_url text not null check(application_url ~ '^https://'), unique nulls not distinct(university_id,program_id,title,cycle,student_category,source_id));
alter table public.deadlines enable row level security;
grant select on public.deadlines to anon;
grant select,insert,update,delete on public.deadlines to authenticated;
create policy admin_all on public.deadlines for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_read on public.deadlines for select to anon,authenticated using(verification_status='verified'  and exists(select 1 from public.universities u where u.id=university_id and u.published));
create index on public.deadlines(university_id);
create trigger audit_changes after insert or update or delete on public.deadlines for each row execute function public.audit_content();
create trigger updated_at before update on public.deadlines for each row execute function public.touch_updated_at();

create table public.requirements(id uuid primary key default gen_random_uuid(),
 university_id uuid not null references public.universities on delete cascade,
 source_id uuid not null references public.data_sources,
 source_url text not null check(source_url ~ '^https://'),
 year integer check(year between 1900 and 2100),
 verification_status text not null default 'needs_review' check(verification_status in ('verified','needs_review','outdated','missing_source')),
 verified_at timestamptz, notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(verification_status<>'verified' or verified_at is not null),
 program_id uuid references public.programs, kind text not null check(kind in ('SAT','ACT','IELTS','TOEFL','document','other')), label text not null, minimum numeric, maximum numeric, student_category text not null, required boolean, check(minimum<=maximum), check(minimum>=0), check(kind<>'IELTS' or maximum<=9), check(kind<>'IELTS' or minimum<=9), check(kind<>'SAT' or minimum between 400 and 1600), check(kind<>'ACT' or minimum between 1 and 36), check(kind<>'TOEFL' or minimum<=120));
alter table public.requirements enable row level security;
grant select on public.requirements to anon;
grant select,insert,update,delete on public.requirements to authenticated;
create policy admin_all on public.requirements for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_read on public.requirements for select to anon,authenticated using(verification_status='verified'  and exists(select 1 from public.universities u where u.id=university_id and u.published));
create index on public.requirements(university_id);
create trigger audit_changes after insert or update or delete on public.requirements for each row execute function public.audit_content();
create trigger updated_at before update on public.requirements for each row execute function public.touch_updated_at();

create table public.financial_aid(id uuid primary key default gen_random_uuid(),
 university_id uuid not null references public.universities on delete cascade,
 source_id uuid not null references public.data_sources,
 source_url text not null check(source_url ~ '^https://'),
 year integer check(year between 1900 and 2100),
 verification_status text not null default 'needs_review' check(verification_status in ('verified','needs_review','outdated','missing_source')),
 verified_at timestamptz, notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(verification_status<>'verified' or verified_at is not null),
 name text not null, student_category text not null, eligibility text not null, application_url text not null check(application_url ~ '^https://'), amount numeric check(amount>=0), currency text check(currency ~ '^[A-Z]{3}$'), check(amount is null or currency is not null));
alter table public.financial_aid enable row level security;
grant select on public.financial_aid to anon;
grant select,insert,update,delete on public.financial_aid to authenticated;
create policy admin_all on public.financial_aid for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_read on public.financial_aid for select to anon,authenticated using(verification_status='verified'  and exists(select 1 from public.universities u where u.id=university_id and u.published));
create index on public.financial_aid(university_id);
create trigger audit_changes after insert or update or delete on public.financial_aid for each row execute function public.audit_content();
create trigger updated_at before update on public.financial_aid for each row execute function public.touch_updated_at();

create table public.media(id uuid primary key default gen_random_uuid(),
 university_id uuid not null references public.universities on delete cascade,
 source_id uuid not null references public.data_sources,
 source_url text not null check(source_url ~ '^https://'),
 year integer check(year between 1900 and 2100),
 verification_status text not null default 'needs_review' check(verification_status in ('verified','needs_review','outdated','missing_source')),
 verified_at timestamptz, notes text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(verification_status<>'verified' or verified_at is not null),
 kind text not null check(kind in ('campus','logo','faculty')), professor_id uuid references public.professors on delete cascade, url text not null check(url ~ '^https://'), alt text not null, creator text not null, license text not null, license_url text not null check(license_url ~ '^https://'), reuse_permitted boolean not null default false, width integer check(width>0), height integer check(height>0), unique(university_id,url));
alter table public.media enable row level security;
grant select on public.media to anon;
grant select,insert,update,delete on public.media to authenticated;
create policy admin_all on public.media for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_read on public.media for select to anon,authenticated using(verification_status='verified' and reuse_permitted and exists(select 1 from public.universities u where u.id=university_id and u.published));
create index on public.media(university_id);
create trigger audit_changes after insert or update or delete on public.media for each row execute function public.audit_content();
create trigger updated_at before update on public.media for each row execute function public.touch_updated_at();

-- Semantic read models reuse canonical tables and their RLS, rather than duplicating facts.
create view public.tuition with(security_invoker=true) as select * from public.costs where category='tuition';
create view public.acceptance_stats with(security_invoker=true) as select * from public.admissions;
create view public.student_stats with(security_invoker=true) as select * from public.data_points where metric in ('enrollment','international_students','graduation_rate','employment_rate','student_faculty_ratio');
create view public.user_profiles with(security_invoker=true) as select * from public.profiles;
grant select on public.tuition,public.acceptance_stats,public.student_stats to anon,authenticated;
grant select on public.user_profiles to authenticated;

create or replace function public.approve_observation(observation_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.source_records; begin
 if not public.is_admin() then raise exception 'Administrator required'; end if;
 select * into r from public.source_records where id=observation_id for update;
 if r.id is null or r.status not in ('pending','conflicting') or r.university_id is null or r.normalized_value is null then raise exception 'Observation cannot be approved'; end if;
 perform pg_advisory_xact_lock(hashtextextended(r.university_id::text||r.metric||r.year::text,0));
 update public.data_points set canonical=false where university_id=r.university_id and metric=r.metric and year=r.year and canonical;
 insert into public.data_points(university_id,metric,year,value,unit,source_id,source_url,observation_id,verification_status,verified_at,confidence,notes,canonical)
 values(r.university_id,r.metric,r.year,r.normalized_value,r.unit,r.source_id,r.source_url,r.id,'verified',now(),r.confidence,r.notes,true);
 update public.source_records set status='approved' where id=r.id;
 insert into public.verification_logs(entity_table,entity_id,actor_id,status) values('source_records',r.id,auth.uid(),'approved');
end $$;
create function public.reject_observation(observation_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'Administrator required'; end if;
 update public.source_records set status='rejected' where id=observation_id and status in ('pending','conflicting');
 if not found then raise exception 'Observation cannot be rejected'; end if;
 insert into public.verification_logs(entity_table,entity_id,actor_id,status) values('source_records',observation_id,auth.uid(),'rejected');
end $$;
revoke all on function public.reject_observation(uuid) from public;
grant execute on function public.reject_observation(uuid) to authenticated;
-- Published fields changed in place must be reviewed again; canonical supersession is exempt.
create function public.invalidate_verification() returns trigger language plpgsql set search_path='' as $$ begin
 if old.verification_status='verified' and
 (to_jsonb(new)-array['verification_status','verified_at','updated_at','canonical']) is distinct from
 (to_jsonb(old)-array['verification_status','verified_at','updated_at','canonical']) then
 new.verification_status='needs_review'; new.verified_at=null;
 end if; return new;
end $$;
create trigger invalidate_verification before update on public.data_points for each row execute function public.invalidate_verification();
create trigger invalidate_verification before update on public.admissions for each row execute function public.invalidate_verification();
create trigger invalidate_verification before update on public.costs for each row execute function public.invalidate_verification();
create trigger invalidate_verification before update on public.ranking_entries for each row execute function public.invalidate_verification();
create trigger invalidate_verification before update on public.scholarships for each row execute function public.invalidate_verification();
create trigger invalidate_verification before update on public.departments for each row execute function public.invalidate_verification();
create trigger invalidate_verification before update on public.professors for each row execute function public.invalidate_verification();
create trigger invalidate_verification before update on public.research for each row execute function public.invalidate_verification();
create trigger invalidate_verification before update on public.deadlines for each row execute function public.invalidate_verification();
create trigger invalidate_verification before update on public.requirements for each row execute function public.invalidate_verification();
create trigger invalidate_verification before update on public.financial_aid for each row execute function public.invalidate_verification();
create trigger invalidate_verification before update on public.media for each row execute function public.invalidate_verification();

create or replace function public.verify_record(entity text, record_id uuid) returns void language plpgsql security definer set search_path='' as $$ declare sourced uuid; begin
 if not public.is_admin() then raise exception 'Administrator required'; end if;
 if entity not in ('admissions','costs','data_points','ranking_entries','scholarships','departments','professors','research','deadlines','requirements','financial_aid','media','university_programs') then raise exception 'Unsupported verification entity'; end if;
 execute format('select source_id from public.%I where id=$1 for update',entity) into sourced using record_id;
 if sourced is null then raise exception 'A source is required before verification'; end if;
 execute format('update public.%I set verification_status=''verified'',verified_at=now() where id=$1',entity) using record_id;
 insert into public.verification_logs(entity_table,entity_id,actor_id,status) values(entity,record_id,auth.uid(),'verified'); end $$;
