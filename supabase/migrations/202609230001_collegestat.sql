-- CollegeStat schema. Apply through Supabase CLI; no production/demo statistics.
create extension if not exists pg_trgm;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text check(length(display_name)<=120), avatar_url text,
 role text not null default 'student' check(role in ('student','admin')),
 preferences jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin') $$;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$ begin
 insert into public.profiles(id,display_name,avatar_url) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name'),new.raw_user_meta_data->>'avatar_url') on conflict(id) do nothing; return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now(); return new; end $$;
create table public.data_sources (id uuid primary key default gen_random_uuid(), name text not null, organization text, url text not null check(url ~ '^https://'), source_type text not null default 'official' check(source_type in ('official','government','accreditation','ranking','secondary','scholarship')), license_notes text, retrieved_at timestamptz, published_at timestamptz, trust_level text not null default 'medium' check(trust_level in ('high','medium','low')), created_at timestamptz not null default now());
create table public.universities(id uuid primary key default gen_random_uuid(), slug text not null unique check(slug ~ '^[a-z0-9-]+$'), name text not null, short_name text, country_code text not null check(country_code ~ '^[A-Z]{2}$'), city text, region text, website text check(website ~ '^https://'), logo_url text check(logo_url ~ '^https://'), university_type text, founded_year integer check(founded_year between 1 and 2100), description text, latitude double precision check(latitude between -90 and 90), longitude double precision check(longitude between -180 and 180), brand_color text, published boolean not null default false, reference_url text check(reference_url ~ '^https://'), reference_retrieved_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.university_aliases(id uuid primary key default gen_random_uuid(), university_id uuid not null references public.universities on delete cascade, alias text not null, unique(university_id,alias));
create table public.campuses(id uuid primary key default gen_random_uuid(), university_id uuid not null references public.universities on delete cascade, name text not null, city text, latitude double precision, longitude double precision);
create table public.programs(id uuid primary key default gen_random_uuid(), name text not null, subject text not null, degree_level text not null, language text, unique(name,degree_level,language));
create table public.university_programs(id uuid primary key default gen_random_uuid(), university_id uuid not null references public.universities on delete cascade, program_id uuid not null references public.programs, unique(university_id,program_id));
create table public.ranking_providers(id uuid primary key default gen_random_uuid(), name text not null, slug text not null unique, website text check(website ~ '^https://'), license_status text not null default 'unavailable' check(license_status in ('permitted','unavailable','restricted')), methodology text);
create table public.ranking_editions(id uuid primary key default gen_random_uuid(), provider_id uuid not null references public.ranking_providers, year integer not null check(year between 1900 and 2100), subject text not null default 'Overall', region text not null default 'Global', permitted boolean not null default false, unique(provider_id,year,subject,region));
create table public.data_points(id uuid primary key default gen_random_uuid(), year integer check(year between 1900 and 2100), source_id uuid references public.data_sources, verification_status text not null default 'needs_review' check(verification_status in ('verified','needs_review','outdated','missing_source')), verified_at timestamptz, confidence text not null default 'low' check(confidence in ('high','medium','low')), notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(verification_status <> 'verified' or (source_id is not null and verified_at is not null)), university_id uuid not null references public.universities on delete cascade, metric text not null, value numeric, text_value text, unit text, check(value is not null or text_value is not null), check(unit <> '%' or value between 0 and 100), unique nulls not distinct(university_id,metric,year,source_id));
create table public.admissions(id uuid primary key default gen_random_uuid(), year integer check(year between 1900 and 2100), source_id uuid references public.data_sources, verification_status text not null default 'needs_review' check(verification_status in ('verified','needs_review','outdated','missing_source')), verified_at timestamptz, confidence text not null default 'low' check(confidence in ('high','medium','low')), notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(verification_status <> 'verified' or (source_id is not null and verified_at is not null)), university_id uuid not null references public.universities on delete cascade, program_id uuid references public.programs, acceptance_rate numeric check(acceptance_rate between 0 and 100), applicants integer check(applicants>=0), admitted integer check(admitted>=0), enrolled integer check(enrolled>=0), sat_min integer check(sat_min between 400 and 1600), sat_max integer check(sat_max between 400 and 1600), act_min integer check(act_min between 1 and 36), act_max integer check(act_max between 1 and 36), ielts_min numeric check(ielts_min between 0 and 9), toefl_min numeric check(toefl_min between 0 and 120), requirements text, language text, deadline date, application_fee numeric check(application_fee>=0), check(admitted<=applicants), check(enrolled<=admitted), check(sat_min<=sat_max), check(act_min<=act_max), unique nulls not distinct(university_id,program_id,year,source_id));
create table public.costs(id uuid primary key default gen_random_uuid(), year integer check(year between 1900 and 2100), source_id uuid references public.data_sources, verification_status text not null default 'needs_review' check(verification_status in ('verified','needs_review','outdated','missing_source')), verified_at timestamptz, confidence text not null default 'low' check(confidence in ('high','medium','low')), notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(verification_status <> 'verified' or (source_id is not null and verified_at is not null)), university_id uuid not null references public.universities on delete cascade, program_id uuid references public.programs, category text not null, amount numeric not null check(amount>=0), currency text not null check(currency ~ '^[A-Z]{3}$'), period text not null check(period in ('year','semester','month','total')), student_category text not null default 'international', unique nulls not distinct(university_id,program_id,category,year,student_category,period,source_id));
create table public.ranking_entries(id uuid primary key default gen_random_uuid(), year integer check(year between 1900 and 2100), source_id uuid references public.data_sources, verification_status text not null default 'needs_review' check(verification_status in ('verified','needs_review','outdated','missing_source')), verified_at timestamptz, confidence text not null default 'low' check(confidence in ('high','medium','low')), notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(verification_status <> 'verified' or (source_id is not null and verified_at is not null)), university_id uuid not null references public.universities on delete cascade, edition_id uuid not null references public.ranking_editions, rank integer check(rank>0), rank_label text, score numeric, check(rank is not null or rank_label is not null), unique(university_id,edition_id,source_id));
create table public.scholarships(id uuid primary key default gen_random_uuid(), year integer check(year between 1900 and 2100), source_id uuid references public.data_sources, verification_status text not null default 'needs_review' check(verification_status in ('verified','needs_review','outdated','missing_source')), verified_at timestamptz, confidence text not null default 'low' check(confidence in ('high','medium','low')), notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(verification_status <> 'verified' or (source_id is not null and verified_at is not null)), name text not null, slug text unique, provider text, description text, amount numeric check(amount>=0), currency text not null default 'USD' check(currency ~ '^[A-Z]{3}$'), funding_type text not null default 'partial', country_code text, level text not null default 'Any', international boolean, deadline date, application_url text check(application_url ~ '^https://'), published boolean not null default false, eligibility jsonb not null default '{}', renewable boolean, tuition_coverage numeric check(tuition_coverage between 0 and 100), living_stipend boolean, travel_coverage boolean);
create table public.university_scholarships(id uuid primary key default gen_random_uuid(), university_id uuid not null references public.universities on delete cascade, scholarship_id uuid not null references public.scholarships on delete cascade, unique(university_id,scholarship_id));
create table public.data_imports(id uuid primary key default gen_random_uuid(), source_id uuid not null references public.data_sources, started_at timestamptz not null default now(), completed_at timestamptz, status text not null default 'pending' check(status in ('pending','review','completed','failed')), records_seen integer not null default 0, created integer not null default 0, updated integer not null default 0, rejected integer not null default 0, warnings jsonb not null default '[]', created_by uuid references auth.users);
create table public.source_records(id uuid primary key default gen_random_uuid(), import_id uuid references public.data_imports, source_id uuid not null references public.data_sources, university_id uuid references public.universities, metric text not null, year integer not null check(year between 1900 and 2100), raw_value jsonb not null, normalized_value numeric, unit text, confidence text not null default 'low', status text not null default 'pending' check(status in ('pending','approved','rejected','conflicting')), source_url text not null check(source_url ~ '^https://'), retrieved_at timestamptz not null default now(), notes text);
create table public.data_quality_checks(id uuid primary key default gen_random_uuid(), record_id uuid references public.source_records on delete cascade, severity text not null, message text not null, resolved boolean not null default false, created_at timestamptz not null default now());
create table public.verification_logs(id uuid primary key default gen_random_uuid(), entity_table text not null, entity_id uuid not null, actor_id uuid references auth.users, status text not null, notes text, created_at timestamptz not null default now());
create table public.audit_logs(id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users, table_name text not null, record_id text, operation text not null, old_value jsonb, new_value jsonb, created_at timestamptz not null default now());
create table public.saved_universities(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, university_id uuid not null references public.universities on delete cascade, status text not null default 'Researching' check(status in ('Researching','Considering','Applying','Submitted','Accepted','Rejected','Waitlisted')), deadline date, last_viewed_at timestamptz, created_at timestamptz not null default now(), unique(user_id,university_id));
create table public.saved_scholarships(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, scholarship_id uuid not null references public.scholarships on delete cascade, track_deadline boolean not null default false, created_at timestamptz not null default now(), unique(user_id,scholarship_id));
create table public.comparison_lists(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, name text not null, university_ids uuid[] not null check(cardinality(university_ids)<=5), created_at timestamptz not null default now(), unique(user_id,name));
create table public.shared_comparisons(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, university_ids uuid[] not null check(cardinality(university_ids) between 2 and 5), created_at timestamptz not null default now());
create table public.saved_searches(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, name text not null, filters jsonb not null, created_at timestamptz not null default now());
create table public.user_lists(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, name text not null check(length(name) between 1 and 100), created_at timestamptz not null default now(), unique(user_id,name));
create table public.user_list_items(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, list_id uuid not null references public.user_lists on delete cascade, university_id uuid not null references public.universities on delete cascade, position integer not null default 0, unique(list_id,university_id));
create table public.user_notes(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, university_id uuid not null references public.universities on delete cascade, body text not null check(length(body)<=10000), updated_at timestamptz not null default now(), unique(user_id,university_id));
create table public.user_checklist(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, university_id uuid references public.universities on delete cascade, title text not null check(length(title)<=300), done boolean not null default false, due_at date, created_at timestamptz not null default now());
create table public.fit_scores(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, university_id uuid not null references public.universities on delete cascade, total_score numeric check(total_score between 0 and 100), components jsonb not null, calculated_at timestamptz not null default now(), unique(user_id,university_id));
create table public.research_history(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, university_id uuid not null references public.universities on delete cascade, viewed_at timestamptz not null default now(), unique(user_id,university_id));
create table public.notifications(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, message text not null, href text, read boolean not null default false, created_at timestamptz not null default now());
create table public.exchange_rates(id uuid primary key default gen_random_uuid(), base_currency text not null, quote_currency text not null, rate numeric not null check(rate>0), observed_at timestamptz not null, source_id uuid not null references public.data_sources, unique(base_currency,quote_currency,observed_at));
create table public.rate_limits(bucket text primary key, hits integer not null default 0, reset_at timestamptz not null);
create function public.consume_rate_limit(key text, max_hits integer, window_seconds integer) returns boolean language plpgsql security definer set search_path='' as $$ declare n integer; begin
 insert into public.rate_limits(bucket,hits,reset_at) values(key,1,now()+make_interval(secs=>window_seconds)) on conflict(bucket) do update set hits=case when public.rate_limits.reset_at<now() then 1 else public.rate_limits.hits+1 end,reset_at=case when public.rate_limits.reset_at<now() then now()+make_interval(secs=>window_seconds) else public.rate_limits.reset_at end returning hits into n; return n<=max_hits; end $$;
revoke all on function public.consume_rate_limit(text,integer,integer) from public;
grant execute on function public.consume_rate_limit(text,integer,integer) to service_role;
create function public.audit_content() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.audit_logs(actor_id,table_name,record_id,operation,old_value,new_value) values(auth.uid(),TG_TABLE_NAME,coalesce(new.id,old.id)::text,TG_OP,case when TG_OP<>'INSERT' then to_jsonb(old) end,case when TG_OP<>'DELETE' then to_jsonb(new) end); return coalesce(new,old); end $$;
alter table public.data_sources enable row level security;
grant select,insert,update,delete on public.data_sources to authenticated;
alter table public.programs enable row level security;
grant select,insert,update,delete on public.programs to authenticated;
alter table public.ranking_providers enable row level security;
grant select,insert,update,delete on public.ranking_providers to authenticated;
alter table public.exchange_rates enable row level security;
grant select,insert,update,delete on public.exchange_rates to authenticated;
alter table public.university_aliases enable row level security;
grant select,insert,update,delete on public.university_aliases to authenticated;
alter table public.campuses enable row level security;
grant select,insert,update,delete on public.campuses to authenticated;
alter table public.university_programs enable row level security;
grant select,insert,update,delete on public.university_programs to authenticated;
alter table public.data_points enable row level security;
grant select,insert,update,delete on public.data_points to authenticated;
alter table public.costs enable row level security;
grant select,insert,update,delete on public.costs to authenticated;
alter table public.admissions enable row level security;
grant select,insert,update,delete on public.admissions to authenticated;
alter table public.university_scholarships enable row level security;
grant select,insert,update,delete on public.university_scholarships to authenticated;
alter table public.data_imports enable row level security;
grant select,insert,update,delete on public.data_imports to authenticated;
alter table public.source_records enable row level security;
grant select,insert,update,delete on public.source_records to authenticated;
alter table public.data_quality_checks enable row level security;
grant select,insert,update,delete on public.data_quality_checks to authenticated;
alter table public.verification_logs enable row level security;
grant select,insert,update,delete on public.verification_logs to authenticated;
alter table public.audit_logs enable row level security;
grant select,insert,update,delete on public.audit_logs to authenticated;
alter table public.saved_universities enable row level security;
grant select,insert,update,delete on public.saved_universities to authenticated;
alter table public.saved_scholarships enable row level security;
grant select,insert,update,delete on public.saved_scholarships to authenticated;
alter table public.comparison_lists enable row level security;
grant select,insert,update,delete on public.comparison_lists to authenticated;
alter table public.shared_comparisons enable row level security;
grant select,insert,update,delete on public.shared_comparisons to authenticated;
alter table public.saved_searches enable row level security;
grant select,insert,update,delete on public.saved_searches to authenticated;
alter table public.user_lists enable row level security;
grant select,insert,update,delete on public.user_lists to authenticated;
alter table public.user_list_items enable row level security;
grant select,insert,update,delete on public.user_list_items to authenticated;
alter table public.user_notes enable row level security;
grant select,insert,update,delete on public.user_notes to authenticated;
alter table public.user_checklist enable row level security;
grant select,insert,update,delete on public.user_checklist to authenticated;
alter table public.fit_scores enable row level security;
grant select,insert,update,delete on public.fit_scores to authenticated;
alter table public.research_history enable row level security;
grant select,insert,update,delete on public.research_history to authenticated;
alter table public.notifications enable row level security;
grant select,insert,update,delete on public.notifications to authenticated;
alter table public.universities enable row level security;
grant select,insert,update,delete on public.universities to authenticated;
alter table public.scholarships enable row level security;
grant select,insert,update,delete on public.scholarships to authenticated;
alter table public.ranking_editions enable row level security;
grant select,insert,update,delete on public.ranking_editions to authenticated;
alter table public.ranking_entries enable row level security;
grant select,insert,update,delete on public.ranking_entries to authenticated;
alter table public.profiles enable row level security;
grant select,insert,update,delete on public.profiles to authenticated;
alter table public.rate_limits enable row level security;
grant select on public.data_sources to anon;
create policy admin_all on public.data_sources for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_read on public.data_sources for select to anon,authenticated using(true);
grant select on public.programs to anon;
create policy admin_all on public.programs for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_read on public.programs for select to anon,authenticated using(true);
grant select on public.ranking_providers to anon;
create policy admin_all on public.ranking_providers for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_read on public.ranking_providers for select to anon,authenticated using(true);
grant select on public.exchange_rates to anon;
create policy admin_all on public.exchange_rates for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_read on public.exchange_rates for select to anon,authenticated using(true);
grant select on public.university_aliases to anon;
create policy admin_all on public.university_aliases for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_read on public.university_aliases for select to anon,authenticated using(exists(select 1 from public.universities u where u.id=university_id and u.published));
grant select on public.campuses to anon;
create policy admin_all on public.campuses for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_read on public.campuses for select to anon,authenticated using(exists(select 1 from public.universities u where u.id=university_id and u.published));
grant select on public.university_programs to anon;
create policy admin_all on public.university_programs for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_read on public.university_programs for select to anon,authenticated using(exists(select 1 from public.universities u where u.id=university_id and u.published));
grant select on public.data_points to anon;
create policy admin_all on public.data_points for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_read on public.data_points for select to anon,authenticated using(exists(select 1 from public.universities u where u.id=university_id and u.published));
grant select on public.costs to anon;
create policy admin_all on public.costs for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_read on public.costs for select to anon,authenticated using(exists(select 1 from public.universities u where u.id=university_id and u.published));
grant select on public.admissions to anon;
create policy admin_all on public.admissions for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_read on public.admissions for select to anon,authenticated using(exists(select 1 from public.universities u where u.id=university_id and u.published));
grant select on public.university_scholarships to anon;
create policy admin_all on public.university_scholarships for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_read on public.university_scholarships for select to anon,authenticated using(exists(select 1 from public.universities u where u.id=university_id and u.published));
grant select on public.universities to anon;
create policy admin_all on public.universities for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_read on public.universities for select to anon,authenticated using(published);
grant select on public.scholarships to anon;
create policy admin_all on public.scholarships for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_read on public.scholarships for select to anon,authenticated using(published);
grant select on public.ranking_editions to anon;
create policy admin_all on public.ranking_editions for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_read on public.ranking_editions for select to anon,authenticated using(permitted and exists(select 1 from public.ranking_providers p where p.id=provider_id and p.license_status='permitted'));
grant select on public.ranking_entries to anon;
create policy admin_all on public.ranking_entries for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy public_read on public.ranking_entries for select to anon,authenticated using(exists(select 1 from public.universities u where u.id=university_id and u.published) and exists(select 1 from public.ranking_editions e join public.ranking_providers p on p.id=e.provider_id where e.id=edition_id and e.permitted and p.license_status='permitted'));
create policy admin_read on public.data_imports for select to authenticated using(public.is_admin());
create policy admin_write on public.data_imports for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy admin_read on public.source_records for select to authenticated using(public.is_admin());
create policy admin_write on public.source_records for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy admin_read on public.data_quality_checks for select to authenticated using(public.is_admin());
create policy admin_write on public.data_quality_checks for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy admin_read on public.verification_logs for select to authenticated using(public.is_admin());
create policy admin_read on public.audit_logs for select to authenticated using(public.is_admin());
create policy owner_access on public.saved_universities for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create index on public.saved_universities(user_id);
create policy owner_access on public.saved_scholarships for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create index on public.saved_scholarships(user_id);
create policy owner_access on public.comparison_lists for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create index on public.comparison_lists(user_id);
create policy owner_access on public.shared_comparisons for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create index on public.shared_comparisons(user_id);
create policy owner_access on public.saved_searches for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create index on public.saved_searches(user_id);
create policy owner_access on public.user_lists for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create index on public.user_lists(user_id);
create policy owner_access on public.user_list_items for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid() and exists(select 1 from public.user_lists l where l.id=list_id and l.user_id=auth.uid()));
create index on public.user_list_items(user_id);
create policy owner_access on public.user_notes for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create index on public.user_notes(user_id);
create policy owner_access on public.user_checklist for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create index on public.user_checklist(user_id);
create policy owner_access on public.fit_scores for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create index on public.fit_scores(user_id);
create policy owner_access on public.research_history for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create index on public.research_history(user_id);
create policy owner_access on public.notifications for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create index on public.notifications(user_id);
revoke insert,update,delete on public.profiles from authenticated;
grant update(display_name,avatar_url,preferences) on public.profiles to authenticated;
create policy profile_owner on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
create policy profile_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create function public.save_comparison(ids uuid[], list_name text) returns uuid language plpgsql security invoker set search_path='' as $$ declare result uuid; begin
 if auth.uid() is null or cardinality(ids)>5 or length(list_name)>120 or (select count(distinct id) from public.universities where published and id=any(ids))<>cardinality(ids) then raise exception 'Invalid comparison'; end if;
 insert into public.comparison_lists(user_id,name,university_ids) values(auth.uid(),list_name,ids) on conflict(user_id,name) do update set university_ids=excluded.university_ids returning id into result; return result; end $$;
create function public.read_shared_comparison(share_id uuid) returns uuid[] language sql stable security definer set search_path='' as $$ select university_ids from public.shared_comparisons where id=share_id $$;
revoke all on function public.read_shared_comparison(uuid) from public;
grant execute on function public.read_shared_comparison(uuid) to anon,authenticated;
create function public.approve_observation(observation_id uuid) returns void language plpgsql security definer set search_path='' as $$ declare r public.source_records; begin
 if not public.is_admin() then raise exception 'Administrator required'; end if;
 select * into r from public.source_records where id=observation_id for update;
 if r.id is null or r.status not in ('pending','conflicting') or r.university_id is null or r.normalized_value is null then raise exception 'Observation cannot be approved'; end if;
 insert into public.data_points(university_id,metric,year,value,unit,source_id,verification_status,verified_at,confidence,notes) values(r.university_id,r.metric,r.year,r.normalized_value,r.unit,r.source_id,'verified',now(),r.confidence,r.notes);
 update public.source_records set status='approved' where id=r.id;
 insert into public.verification_logs(entity_table,entity_id,actor_id,status) values('source_records',r.id,auth.uid(),'approved'); end $$;
create index universities_name_trgm on public.universities using gin(name gin_trgm_ops);
create index university_alias_trgm on public.university_aliases using gin(alias gin_trgm_ops);
create index university_location on public.universities(country_code,city);
create index on public.admissions(acceptance_rate);
create index on public.costs(currency,amount);
create index on public.ranking_entries(edition_id,rank);
create index university_search on public.universities using gin(to_tsvector('simple',name||' '||coalesce(city,'')||' '||country_code));
create function public.search_universities(search_term text, result_limit integer default 8) returns setof public.universities language sql stable security invoker set search_path=public as $$
 select u.* from public.universities u where u.published and (search_term='' or u.name ilike '%'||search_term||'%' or u.city ilike '%'||search_term||'%' or u.country_code ilike search_term or similarity(u.name,search_term)>.15 or exists(select 1 from public.university_aliases a where a.university_id=u.id and (a.alias ilike '%'||search_term||'%' or similarity(a.alias,search_term)>.3)) or exists(select 1 from public.university_programs up join public.programs p on p.id=up.program_id where up.university_id=u.id and (p.name||' '||p.subject) ilike '%'||search_term||'%')) order by (lower(u.name)=lower(search_term)) desc, similarity(u.name,search_term) desc,u.name limit greatest(1,least(result_limit,20)) $$;
create trigger audit_changes after insert or update or delete on public.universities for each row execute function public.audit_content();
create trigger audit_changes after insert or update or delete on public.data_points for each row execute function public.audit_content();
create trigger audit_changes after insert or update or delete on public.costs for each row execute function public.audit_content();
create trigger audit_changes after insert or update or delete on public.admissions for each row execute function public.audit_content();
create trigger audit_changes after insert or update or delete on public.ranking_entries for each row execute function public.audit_content();
create trigger audit_changes after insert or update or delete on public.scholarships for each row execute function public.audit_content();
create trigger audit_changes after insert or update or delete on public.data_sources for each row execute function public.audit_content();
create trigger audit_changes after insert or update or delete on public.ranking_editions for each row execute function public.audit_content();
create trigger audit_changes after insert or update or delete on public.ranking_providers for each row execute function public.audit_content();
create trigger audit_changes after insert or update or delete on public.programs for each row execute function public.audit_content();
create trigger audit_changes after insert or update or delete on public.university_programs for each row execute function public.audit_content();
create trigger audit_changes after insert or update or delete on public.source_records for each row execute function public.audit_content();
create trigger updated_at before update on public.profiles for each row execute function public.touch_updated_at();
create trigger updated_at before update on public.universities for each row execute function public.touch_updated_at();
create trigger updated_at before update on public.data_points for each row execute function public.touch_updated_at();
create trigger updated_at before update on public.costs for each row execute function public.touch_updated_at();
create trigger updated_at before update on public.admissions for each row execute function public.touch_updated_at();
create trigger updated_at before update on public.ranking_entries for each row execute function public.touch_updated_at();
create trigger updated_at before update on public.scholarships for each row execute function public.touch_updated_at();
create trigger updated_at before update on public.user_notes for each row execute function public.touch_updated_at();
create index on public.university_aliases(university_id);
create index on public.campuses(university_id);
create index on public.university_programs(university_id);
create index on public.data_points(university_id);
create index on public.costs(university_id);
create index on public.admissions(university_id);
create index on public.university_scholarships(university_id);
create index on public.ranking_entries(university_id);
-- Storage uploads are private writes; only institutional logos are public reads.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('university-logos','university-logos',true,5242880,array['image/png','image/jpeg','image/webp']) on conflict(id) do nothing;
create policy logo_read on storage.objects for select to anon,authenticated using(bucket_id='university-logos');
create policy logo_admin on storage.objects for all to authenticated using(bucket_id='university-logos' and public.is_admin()) with check(bucket_id='university-logos' and public.is_admin());
-- A bounded research query runs in Postgres; only the current page is hydrated.
create function public.explore_universities(filters jsonb default '{}', page_number integer default 1) returns jsonb language sql stable security invoker set search_path=public as $$
with facts as (
select u.*,
 coalesce((select a.acceptance_rate from public.admissions a where a.university_id=u.id and a.program_id is null order by a.year desc nulls last limit 1),(select d.value from public.data_points d where d.university_id=u.id and d.metric='admission' order by d.year desc nulls last limit 1)) admission,
 (select c.amount from public.costs c where c.university_id=u.id and c.category='tuition' and c.currency='USD' and c.period='year' and c.student_category='international' order by c.year desc nulls last limit 1) tuition,
 (select d.value from public.data_points d where d.university_id=u.id and d.metric='international_students' order by d.year desc nulls last limit 1) international,
 (select d.value from public.data_points d where d.university_id=u.id and d.metric='graduation_rate' order by d.year desc nulls last limit 1) graduation,
 (select d.value from public.data_points d where d.university_id=u.id and d.metric='aid_recipients' order by d.year desc nulls last limit 1) aid,
 (select a.ielts_min from public.admissions a where a.university_id=u.id and a.program_id is null order by a.year desc nulls last limit 1) ielts
from public.universities u where u.published), matched as (
 select * from facts u where
 (coalesce(filters->>'q','')='' or u.name ilike '%'||(filters->>'q')||'%' or u.city ilike '%'||(filters->>'q')||'%') and
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
 (coalesce(filters->>'field','')='' or exists(select 1 from public.university_programs up join public.programs p on p.id=up.program_id where up.university_id=u.id and (p.name||' '||p.subject) ilike '%'||(filters->>'field')||'%')) and
 (coalesce(filters->>'degree','')='' or exists(select 1 from public.university_programs up join public.programs p on p.id=up.program_id where up.university_id=u.id and p.degree_level=filters->>'degree')) and
 (coalesce(filters->>'language','')='' or exists(select 1 from public.university_programs up join public.programs p on p.id=up.program_id where up.university_id=u.id and p.language=filters->>'language'))), page as (
select id from matched order by case when filters->>'sort'='tuition' then tuition end asc nulls last,case when filters->>'sort'='tuition_desc' then tuition end desc nulls last,case when filters->>'sort'='admission' then admission end asc nulls last,case when filters->>'sort'='international' then international end desc nulls last,name limit 24 offset greatest(0,least(page_number-1,9999))*24)
select jsonb_build_object('ids',coalesce((select jsonb_agg(id) from page),'[]'),'total',(select count(*) from matched),'medianTuition',(select percentile_cont(.5) within group(order by tuition) from matched),'medianAdmission',(select percentile_cont(.5) within group(order by admission) from matched),'countries',(select count(distinct country_code) from matched)) $$;
