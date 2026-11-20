-- PROPOSAL, not applied. Data model v2 (15 Nov 2026). Owner reviews and applies separately.
--
-- Why: university facts are spread over ~150 JSON files (data/published, data/review,
-- data/segment, data/generated) plus the hosted public.* tables behind
-- public.explore_universities. v2 is one normalised model: one row per fact, every fact
-- row points at a source (url + retrieved_at), and per-field provenance in jsonb.
--
-- Shape:
--   * Everything lives in a new schema `v2`, so nothing in public.* changes and the live
--     app keeps working. The one public object is public.explore_universities_v2 (RPC).
--   * Catalogue tables: public read (RLS select using true / published), no client writes.
--     Rows are loaded with COPY from data/v2/*.csv (scripts/ingest/build-v2.ts).
--   * Student tables: owner-only RLS on (select auth.uid()) = user_id.
--   * Column lists are mirrored in server/data-v2/schema.ts; tests/data-v2.test.ts fails if
--     they drift.
--
-- Apply (owner):
--   1. Move to supabase/migrations/20261115120000_data_v2.sql and `supabase db push`
--      (or paste into the SQL editor). Needs pg_trgm (already in `extensions` on Supabase).
--   2. Build the rows: `node --import tsx scripts/ingest/build-v2.ts`
--   3. Load, in this order (FKs): sources, universities, programmes, university_media,
--      rankings, admissions, deadlines, costs, application_requirements,
--      programme_requirements, scholarships, scholarship_universities, essay_prompts:
--        \copy v2.sources from 'data/v2/sources.csv' with (format csv, header true)
--        ... (one \copy per table, same pattern; see data/v2/README in data/README.md)
--   4. Check: select public.explore_universities_v2('{"countries":"GB,DE","ielts_max":6.5}'::jsonb, 1);
--   Optional: add `v2` to the API's exposed schemas only if the app should read tables
--   directly (server/data-v2 does); the RPC works without that.
--
-- Rollback: drop function public.explore_universities_v2(jsonb, integer); drop schema v2 cascade;
-- (student tables are new and empty until the app writes to them.)

create extension if not exists pg_trgm with schema extensions;
create schema if not exists v2;
grant usage on schema v2 to anon, authenticated, service_role;

-- ───────────────────────────── Catalogue ─────────────────────────────

-- One row per distinct source URL. Fact rows reference it via source_id and keep
-- per-field detail (method, origin, which field came from which source) in `provenance`.
create table v2.sources (
  id uuid primary key,
  url text not null unique check (url ~ '^https?://'),
  title text,
  publisher text,
  source_type text not null default 'official'
    check (source_type in ('official','government','ranking','registry','media','aggregator','provider','other')),
  licence text,
  retrieved_at date not null,
  method text,
  created_at timestamptz not null default now()
);

create table v2.universities (
  id uuid primary key,
  slug text not null unique,
  name text not null check (length(name) between 2 and 300),
  short_name text,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  city text,
  region text,
  website text,
  university_type text check (university_type in ('Public','Private','Other')),
  founded_year smallint check (founded_year between 800 and 2035),
  latitude numeric(8,5) check (latitude between -90 and 90),
  longitude numeric(8,5) check (longitude between -180 and 180),
  aliases text[] not null default '{}',
  is_target boolean not null default false,
  target_rank smallint check (target_rank > 0),
  published boolean not null default true,
  source_id uuid references v2.sources(id) on delete set null,
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  updated_at timestamptz not null default now()
);

create table v2.programmes (
  id uuid primary key,
  university_id uuid not null references v2.universities(id) on delete cascade,
  name text not null,
  field text,
  degree_level text not null default 'Bachelor'
    check (degree_level in ('Foundation','Bachelor','Master','Doctorate','Diploma','Other')),
  award text,
  duration_years numeric(3,1) check (duration_years between 0.5 and 8),
  language text,
  intake_terms text[] not null default '{}',
  url text,
  verification_status text not null default 'staged' check (verification_status in ('staged','verified')),
  source_id uuid references v2.sources(id) on delete set null,
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  unique (university_id, name, degree_level)
);

-- Logos, campus photos and videos, each with its licence.
create table v2.university_media (
  id uuid primary key,
  university_id uuid not null references v2.universities(id) on delete cascade,
  kind text not null check (kind in ('logo','campus','photo','video')),
  url text not null check (url ~ '^(https?://|/)'),
  youtube_id text,
  title text,
  alt text,
  creator text,
  licence text,
  licence_url text,
  width integer check (width > 0),
  height integer check (height > 0),
  surface text check (surface in ('light','dark')),
  sort_order smallint not null default 0,
  source_id uuid references v2.sources(id) on delete set null,
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  unique (university_id, kind, url)
);

create table v2.rankings (
  id uuid primary key,
  university_id uuid not null references v2.universities(id) on delete cascade,
  publisher text not null check (publisher ~ '^[a-z0-9_-]+$'),
  edition_year smallint not null check (edition_year between 2000 and 2035),
  subject text not null default 'Overall',
  region text not null default 'Global',
  rank integer check (rank > 0),
  rank_label text not null,
  is_band boolean not null default false,
  score text,
  url text,
  source_id uuid references v2.sources(id) on delete set null,
  unique (university_id, publisher, edition_year, subject, region)
);

-- One row per intake (e.g. 2027 fall). Historic outcome stats (IPEDS 2023) are their own intake rows.
create table v2.admissions (
  id uuid primary key,
  university_id uuid not null references v2.universities(id) on delete cascade,
  intake_year smallint not null check (intake_year between 2000 and 2035),
  intake_term text not null default 'fall' check (intake_term in ('fall','spring','winter','summer','rolling','any')),
  cohort_label text,
  applicants integer check (applicants >= 0),
  admitted integer check (admitted >= 0),
  enrolled integer check (enrolled >= 0),
  acceptance_rate numeric(5,2) check (acceptance_rate between 0 and 100),
  platform text check (platform in ('common_app','ucas','coalition','direct','national_portal','studielink','uni_assist','universitaly','other')),
  platform_note text,
  application_fee numeric(10,2) check (application_fee >= 0),
  application_fee_currency text check (application_fee_currency ~ '^[A-Z]{3}$'),
  sat_act_policy text check (sat_act_policy in ('required','optional','not_considered','recommended','unknown')),
  sat_min smallint check (sat_min between 400 and 1600),
  sat_max smallint check (sat_max between 400 and 1600),
  act_min smallint check (act_min between 1 and 36),
  act_max smallint check (act_max between 1 and 36),
  english_waiver_note text,
  foundation_year text,
  aid_for_internationals boolean,
  aid_note text,
  source_id uuid references v2.sources(id) on delete set null,
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  unique (university_id, intake_year, intake_term)
);

-- One row per application round.
create table v2.deadlines (
  id uuid primary key,
  university_id uuid not null references v2.universities(id) on delete cascade,
  intake_year smallint not null check (intake_year between 2000 and 2035),
  round text not null check (round in ('early_action','restrictive_early_action','early_decision','early_decision_2',
    'regular','priority','rolling','first_round','second_round','third_round','scholarship','document','open','close','other')),
  round_label text not null,
  due_date date,
  due_date_inferred boolean not null default false,
  due_text text,
  timezone text,
  application_url text,
  source_id uuid not null references v2.sources(id),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  check (due_date is not null or due_text is not null),
  unique (university_id, intake_year, round_label)
);

-- One row per university (or programme) × academic year × category × student category.
create table v2.costs (
  id uuid primary key,
  university_id uuid not null references v2.universities(id) on delete cascade,
  programme_id uuid references v2.programmes(id) on delete cascade,
  academic_year text not null check (academic_year ~ '^[0-9]{4}/[0-9]{2}$'),
  category text not null check (category in ('tuition','mandatory_fees','living','housing','room_board','food','books','personal','insurance','total')),
  student_category text not null default 'international'
    check (student_category in ('international','in_state','out_of_state','domestic','all')),
  amount numeric(14,2) check (amount >= 0),
  range_min numeric(14,2) check (range_min >= 0),
  range_max numeric(14,2) check (range_max >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  period text not null default 'year' check (period in ('year','semester','term','credit','month','total')),
  amount_usd numeric(12,2) check (amount_usd >= 0),
  fx_rate_usd numeric(14,8) check (fx_rate_usd > 0),
  fx_date date,
  basis text,
  varies_by_programme boolean,
  source_id uuid not null references v2.sources(id),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  check (amount is not null or range_min is not null)
);
create unique index costs_natural_key on v2.costs
  (university_id, coalesce(programme_id, '00000000-0000-0000-0000-000000000000'::uuid), academic_year, category, student_category);

-- University-wide entry requirements for an intake (English tests, SAT/ACT, documents).
create table v2.application_requirements (
  id uuid primary key,
  university_id uuid not null references v2.universities(id) on delete cascade,
  intake_year smallint check (intake_year between 2000 and 2035),
  kind text not null check (kind in ('IELTS','TOEFL','DUOLINGO','PTE','CAMBRIDGE','SAT','ACT','AP','IB','A_LEVEL',
    'ENGLISH_WAIVER','TRANSCRIPT','RECOMMENDATION','ESSAY','CV','PORTFOLIO','INTERVIEW','ENTRANCE_EXAM','OTHER')),
  status text not null default 'required' check (status in ('required','optional','not_required','conditional','unknown')),
  label text not null,
  minimum numeric(7,2),
  component_minimum numeric(7,2),
  note text,
  source_id uuid not null references v2.sources(id),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  check (kind <> 'IELTS' or minimum is null or minimum between 0 and 9),
  check (kind <> 'TOEFL' or minimum is null or minimum between 0 and 120),
  check (kind <> 'DUOLINGO' or minimum is null or minimum between 10 and 160),
  check (kind <> 'SAT' or minimum is null or minimum between 400 and 1600),
  unique (university_id, intake_year, kind, label)
);

create table v2.programme_requirements (
  id uuid primary key,
  programme_id uuid not null references v2.programmes(id) on delete cascade,
  kind text not null check (kind in ('IELTS','TOEFL','DUOLINGO','PTE','SAT','ACT','AP','IB','A_LEVEL','SUBJECT',
    'PORTFOLIO','INTERVIEW','ENTRANCE_EXAM','OTHER')),
  status text not null default 'required' check (status in ('required','optional','not_required','conditional','unknown')),
  label text not null,
  minimum numeric(7,2),
  component_minimum numeric(7,2),
  note text,
  source_id uuid not null references v2.sources(id),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object'),
  unique (programme_id, kind, label)
);

create table v2.scholarships (
  id uuid primary key,
  slug text not null unique,
  name text not null,
  provider text,
  description text,
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  level text,
  funding_type text check (funding_type in ('full','partial','tuition','stipend','other')),
  amount numeric(14,2) check (amount >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  amount_note text,
  coverage jsonb not null default '{}'::jsonb check (jsonb_typeof(coverage) = 'object'),
  eligible_nationalities text,
  central_asia_eligible boolean,
  deadline date,
  deadline_note text,
  application_url text,
  intake_year smallint check (intake_year between 2000 and 2035),
  published boolean not null default false,
  verification_status text not null default 'staged' check (verification_status in ('staged','verified')),
  source_id uuid not null references v2.sources(id),
  provenance jsonb not null default '{}'::jsonb check (jsonb_typeof(provenance) = 'object')
);

create table v2.scholarship_universities (
  scholarship_id uuid not null references v2.scholarships(id) on delete cascade,
  university_id uuid not null references v2.universities(id) on delete cascade,
  source_id uuid references v2.sources(id) on delete set null,
  primary key (scholarship_id, university_id)
);

-- Essay questions for an intake: a university's own, a platform's (Common App, UCAS) or a scholarship's.
create table v2.essay_prompts (
  id uuid primary key,
  university_id uuid references v2.universities(id) on delete cascade,
  scholarship_id uuid references v2.scholarships(id) on delete cascade,
  platform text check (platform in ('common_app','ucas','coalition','direct','other')),
  intake_year smallint not null check (intake_year between 2000 and 2035),
  prompt text not null,
  word_limit integer check (word_limit between 1 and 5000),
  required boolean not null default true,
  sort_order smallint not null default 0,
  source_id uuid not null references v2.sources(id),
  check (university_id is not null or scholarship_id is not null or platform is not null)
);

-- ───────────────────────────── Student ─────────────────────────────

create table v2.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (length(display_name) <= 120),
  citizenship text check (citizenship ~ '^[A-Z]{2}$'),
  residence_country text check (residence_country ~ '^[A-Z]{2}$'),
  school_name text check (length(school_name) <= 200),
  graduation_year smallint check (graduation_year between 2020 and 2035),
  intake_year smallint check (intake_year between 2024 and 2035),
  grade_system text check (grade_system in ('five_point','percent','gpa_4','gpa_5','ib','a_level','ten_point','twelve_point','other')),
  grades_raw jsonb not null default '[]'::jsonb check (jsonb_typeof(grades_raw) = 'array'),   -- [{year, subject?, value, scale}]
  grade_normalized numeric(5,2) check (grade_normalized between 0 and 100),             -- 0–100
  gpa_4 numeric(3,2) check (gpa_4 between 0 and 4),
  tests jsonb not null default '[]'::jsonb check (jsonb_typeof(tests) = 'array'),             -- [{kind, score, sections, taken_at, planned}]
  activities jsonb not null default '[]'::jsonb check (jsonb_typeof(activities) = 'array'),   -- [{title, role, hours_per_week, years}]
  honours jsonb not null default '[]'::jsonb check (jsonb_typeof(honours) = 'array'),         -- [{title, level, year}]
  dream_countries text[] not null default '{}',
  intended_majors text[] not null default '{}',
  budget_usd_per_year integer check (budget_usd_per_year between 0 and 1000000),
  needs_aid boolean,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table v2.my_colleges (
  user_id uuid not null references auth.users(id) on delete cascade,
  university_id uuid not null references v2.universities(id) on delete cascade,
  status text not null default 'saved' check (status in ('saved','researching','shortlisted','applying','applied',
    'admitted','waitlisted','rejected','enrolled','dropped')),
  fit text check (fit in ('reach','target','safety')),
  notes text check (length(notes) <= 5000),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, university_id)
);

create table v2.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  university_id uuid not null references v2.universities(id) on delete cascade,
  programme_id uuid references v2.programmes(id) on delete set null,
  deadline_id uuid references v2.deadlines(id) on delete set null,
  intake_year smallint not null check (intake_year between 2024 and 2035),
  round text not null default 'regular',
  platform text check (platform in ('common_app','ucas','coalition','direct','national_portal','studielink','uni_assist','universitaly','other')),
  status text not null default 'planning' check (status in ('planning','in_progress','submitted','interview',
    'admitted','waitlisted','rejected','withdrawn')),
  submitted_at timestamptz,
  decision_at timestamptz,
  fee_paid boolean not null default false,
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  notes text check (length(notes) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, university_id, intake_year, round)
);

create table v2.essays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  application_id uuid references v2.applications(id) on delete set null,
  prompt_id uuid references v2.essay_prompts(id) on delete set null,
  title text not null default '' check (length(title) <= 300),
  body text not null default '' check (length(body) <= 100000),
  word_count integer not null default 0 check (word_count >= 0),
  status text not null default 'draft' check (status in ('draft','review','final')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ───────────────────────────── Indexes ─────────────────────────────

-- Explorer filters
create index universities_country_idx on v2.universities(country_code) where published;
create index universities_region_idx on v2.universities(region) where published;
create index universities_target_idx on v2.universities(target_rank) where is_target;
create index universities_name_trgm on v2.universities using gin (lower(name) extensions.gin_trgm_ops);
create index costs_tuition_idx on v2.costs(university_id, academic_year desc)
  where category = 'tuition' and programme_id is null;
create index costs_tuition_usd_idx on v2.costs(amount_usd) where category = 'tuition' and programme_id is null;
create index requirements_kind_idx on v2.application_requirements(kind, minimum);
create index requirements_university_idx on v2.application_requirements(university_id, kind);
create index admissions_university_idx on v2.admissions(university_id, intake_year desc);
create index admissions_platform_idx on v2.admissions(platform) where platform is not null;
create index programmes_university_idx on v2.programmes(university_id, degree_level);
create index programmes_text_trgm on v2.programmes using gin (lower(name || ' ' || coalesce(field, '')) extensions.gin_trgm_ops);
create index rankings_publisher_idx on v2.rankings(publisher, edition_year, rank);
create index deadlines_university_idx on v2.deadlines(university_id, due_date);
create index deadlines_due_idx on v2.deadlines(due_date) where due_date is not null;
create index scholarships_country_idx on v2.scholarships(country_code) where published;
-- FK coverage (joins + cascades)
create index universities_source_idx on v2.universities(source_id);
create index programmes_source_idx on v2.programmes(source_id);
create index media_university_idx on v2.university_media(university_id, kind, sort_order);
create index media_source_idx on v2.university_media(source_id);
create index rankings_source_idx on v2.rankings(source_id);
create index admissions_source_idx on v2.admissions(source_id);
create index deadlines_source_idx on v2.deadlines(source_id);
create index costs_programme_idx on v2.costs(programme_id) where programme_id is not null;
create index costs_source_idx on v2.costs(source_id);
create index requirements_source_idx on v2.application_requirements(source_id);
create index programme_requirements_source_idx on v2.programme_requirements(source_id);
create index scholarships_source_idx on v2.scholarships(source_id);
create index scholarship_universities_university_idx on v2.scholarship_universities(university_id);
create index scholarship_universities_source_idx on v2.scholarship_universities(source_id);
create index essay_prompts_university_idx on v2.essay_prompts(university_id) where university_id is not null;
create index essay_prompts_scholarship_idx on v2.essay_prompts(scholarship_id) where scholarship_id is not null;
create index essay_prompts_source_idx on v2.essay_prompts(source_id);
create index my_colleges_university_idx on v2.my_colleges(university_id);
create index applications_user_idx on v2.applications(user_id, intake_year);
create index applications_university_idx on v2.applications(university_id);
create index applications_programme_idx on v2.applications(programme_id) where programme_id is not null;
create index applications_deadline_idx on v2.applications(deadline_id) where deadline_id is not null;
create index essays_user_idx on v2.essays(user_id, updated_at desc);
create index essays_application_idx on v2.essays(application_id) where application_id is not null;
create index essays_prompt_idx on v2.essays(prompt_id) where prompt_id is not null;

-- ───────────────────────────── RLS + grants ─────────────────────────────

alter table v2.sources enable row level security;
alter table v2.universities enable row level security;
alter table v2.programmes enable row level security;
alter table v2.university_media enable row level security;
alter table v2.rankings enable row level security;
alter table v2.admissions enable row level security;
alter table v2.deadlines enable row level security;
alter table v2.costs enable row level security;
alter table v2.application_requirements enable row level security;
alter table v2.programme_requirements enable row level security;
alter table v2.scholarships enable row level security;
alter table v2.scholarship_universities enable row level security;
alter table v2.essay_prompts enable row level security;
alter table v2.profiles enable row level security;
alter table v2.my_colleges enable row level security;
alter table v2.applications enable row level security;
alter table v2.essays enable row level security;

-- Catalogue: anyone may read; only service_role (bypasses RLS) loads rows.
create policy sources_read on v2.sources for select to anon, authenticated using (true);
create policy universities_read on v2.universities for select to anon, authenticated using (published);
create policy programmes_read on v2.programmes for select to anon, authenticated using (true);
create policy media_read on v2.university_media for select to anon, authenticated using (true);
create policy rankings_read on v2.rankings for select to anon, authenticated using (true);
create policy admissions_read on v2.admissions for select to anon, authenticated using (true);
create policy deadlines_read on v2.deadlines for select to anon, authenticated using (true);
create policy costs_read on v2.costs for select to anon, authenticated using (true);
create policy application_requirements_read on v2.application_requirements for select to anon, authenticated using (true);
create policy programme_requirements_read on v2.programme_requirements for select to anon, authenticated using (true);
create policy scholarships_read on v2.scholarships for select to anon, authenticated using (published);
create policy scholarship_universities_read on v2.scholarship_universities for select to anon, authenticated using (true);
create policy essay_prompts_read on v2.essay_prompts for select to anon, authenticated using (true);

grant select on v2.sources, v2.universities, v2.programmes, v2.university_media, v2.rankings, v2.admissions,
  v2.deadlines, v2.costs, v2.application_requirements, v2.programme_requirements, v2.scholarships,
  v2.scholarship_universities, v2.essay_prompts to anon, authenticated;

-- Student: owner only. (select auth.uid()) is evaluated once per statement (advisor 0003).
create policy profiles_owner on v2.profiles for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy my_colleges_owner on v2.my_colleges for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy applications_owner on v2.applications for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy essays_owner on v2.essays for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on v2.profiles, v2.my_colleges, v2.applications, v2.essays from anon;
grant select, insert, update, delete on v2.profiles, v2.my_colleges, v2.applications, v2.essays to authenticated;
grant all on all tables in schema v2 to service_role;

-- updated_at upkeep for student rows
create or replace function v2.touch_updated_at() returns trigger
  language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger profiles_touch before update on v2.profiles for each row execute function v2.touch_updated_at();
create trigger my_colleges_touch before update on v2.my_colleges for each row execute function v2.touch_updated_at();
create trigger applications_touch before update on v2.applications for each row execute function v2.touch_updated_at();
create trigger essays_touch before update on v2.essays for each row execute function v2.touch_updated_at();

-- An essay may only link to the writer's own application.
create or replace function v2.essay_application_owner() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if new.application_id is not null and not exists (
    select 1 from v2.applications a where a.id = new.application_id and a.user_id = new.user_id) then
    raise exception 'application belongs to another user';
  end if;
  return new;
end $$;
create trigger essays_application_owner before insert or update of application_id, user_id on v2.essays
  for each row execute function v2.essay_application_owner();

-- ───────────────────────────── Explorer ─────────────────────────────

-- Latest headline facts per university, one row each. security_invoker keeps RLS in force.
create view v2.university_facts with (security_invoker = true) as
select u.id, u.slug, u.name, u.short_name, u.country_code, u.region, u.city, u.university_type, u.aliases,
  u.is_target, u.target_rank,
  t.amount_usd as tuition_usd, t.academic_year as tuition_year,
  i.minimum as ielts_min,
  p.platform,
  a.acceptance_rate,
  (select r.rank from v2.rankings r where r.university_id = u.id and r.publisher = 'qs'
     and r.subject = 'Overall' and r.region = 'Global' order by r.edition_year desc limit 1) as qs_rank,
  (select r.rank from v2.rankings r where r.university_id = u.id and r.publisher = 'the'
     and r.subject = 'Overall' and r.region = 'Global' order by r.edition_year desc limit 1) as the_rank,
  (select r.rank from v2.rankings r where r.university_id = u.id and r.publisher = 'arwu'
     and r.subject = 'Overall' and r.region = 'Global' order by r.edition_year desc limit 1) as arwu_rank,
  (select min(d.due_date) from v2.deadlines d where d.university_id = u.id and d.due_date >= current_date) as next_deadline
from v2.universities u
left join lateral (
  select c.amount_usd, c.academic_year from v2.costs c
  where c.university_id = u.id and c.programme_id is null and c.category = 'tuition'
    and c.student_category in ('international','out_of_state','all') and c.amount_usd is not null
  order by c.academic_year desc, (c.student_category = 'international') desc limit 1) t on true
left join lateral (
  select r.minimum from v2.application_requirements r
  where r.university_id = u.id and r.kind = 'IELTS' and r.minimum is not null
  order by r.intake_year desc nulls last limit 1) i on true
left join lateral (
  select ad.platform from v2.admissions ad where ad.university_id = u.id and ad.platform is not null
  order by ad.intake_year desc limit 1) p on true
left join lateral (
  select ad.acceptance_rate from v2.admissions ad where ad.university_id = u.id and ad.acceptance_rate is not null
  order by ad.intake_year desc limit 1) a on true
where u.published;

grant select on v2.university_facts to anon, authenticated;

-- Same contract as public.explore_universities (ids, total, medianTuition, medianAdmission,
-- countries; 24 per page) with the extra v2 filters:
--   countries   'GB,DE,US' (alias: country)          platform   'common_app' | 'ucas' | …
--   ielts_max   0–9                                  tuition_max  USD/year (alias: cost_max)
--   program     text in programme name/field (alias: field), with degree / language
--   targets     'true' → only the 204 Central Asia targets
--   sort        rank | rank_desc | name | tuition | tuition_desc | admission | admission_desc
--               | rank_the | rank_arwu | deadline
create or replace function public.explore_universities_v2(filters jsonb default '{}'::jsonb, page_number integer default 1)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'v2', 'public', 'extensions'
as $function$
declare k text; v jsonb; n numeric;
  f_q text; f_countries text[]; f_program text; f_degree text; f_language text; f_sort text;
begin
  if filters is null or jsonb_typeof(filters) <> 'object' or octet_length(filters::text) > 5000
     or page_number is null or page_number not between 1 and 10000 then raise exception 'Invalid search'; end if;
  for k, v in select * from jsonb_each(filters) loop
    if k not in ('q','country','countries','region','city','type','platform','program','field','degree','language',
                 'scholarships','targets','sort','ielts_max','tuition_max','cost_max','admission_min','admission_max') then
      raise exception 'Unknown filter';
    end if;
    if k in ('ielts_max','tuition_max','cost_max','admission_min','admission_max') then
      if jsonb_typeof(v) <> 'number' then raise exception 'Invalid numeric filter'; end if;
      n := (v #>> '{}')::numeric;
      if n < 0 or n > (case when k = 'ielts_max' then 9 when k in ('tuition_max','cost_max') then 1000000 else 100 end) then
        raise exception 'Filter outside bounds';
      end if;
    elsif jsonb_typeof(v) <> 'string' or length(v #>> '{}') > 200 then
      raise exception 'Invalid text filter';
    end if;
  end loop;

  f_q := lower(trim(coalesce(filters->>'q', '')));
  f_countries := nullif(string_to_array(upper(replace(coalesce(filters->>'countries', filters->>'country', ''), ' ', '')), ','), '{}');
  f_program := nullif(trim(coalesce(filters->>'program', filters->>'field', '')), '');
  f_degree := nullif(filters->>'degree', '');
  f_language := nullif(filters->>'language', '');
  f_sort := coalesce(nullif(filters->>'sort', ''), 'rank');

  return (with matched as (
    select f.* from v2.university_facts f
    where (f_q = '' or not exists (
            select 1 from regexp_split_to_table(f_q, E'\\s+') term
            where term <> '' and lower(concat_ws(' ', f.name, f.short_name, f.city, f.region, f.country_code, f.aliases::text)) not like '%' || term || '%'))
      and (f_countries is null or f.country_code = any(f_countries))
      and (coalesce(filters->>'region', '') = '' or f.region = filters->>'region')
      and (coalesce(filters->>'city', '') = '' or f.city ilike '%' || (filters->>'city') || '%')
      and (coalesce(filters->>'type', '') = '' or f.university_type = filters->>'type')
      and (coalesce(filters->>'platform', '') = '' or f.platform = filters->>'platform')
      and (coalesce(filters->>'targets', '') <> 'true' or f.is_target)
      and (not filters ? 'ielts_max' or f.ielts_min <= (filters->>'ielts_max')::numeric)
      and (not (filters ? 'tuition_max' or filters ? 'cost_max')
           or f.tuition_usd <= coalesce(filters->>'tuition_max', filters->>'cost_max')::numeric)
      and (not filters ? 'admission_min' or f.acceptance_rate >= (filters->>'admission_min')::numeric)
      and (not filters ? 'admission_max' or f.acceptance_rate <= (filters->>'admission_max')::numeric)
      and (coalesce(filters->>'scholarships', '') = '' or exists (
            select 1 from v2.scholarship_universities su join v2.scholarships s on s.id = su.scholarship_id
            where su.university_id = f.id and s.published))
      and ((f_program is null and f_degree is null and f_language is null) or exists (
            select 1 from v2.programmes p where p.university_id = f.id
              and (f_program is null or lower(p.name || ' ' || coalesce(p.field, '')) like '%' || lower(f_program) || '%')
              and (f_degree is null or p.degree_level = f_degree)
              and (f_language is null or p.language ilike '%' || f_language || '%')))
  ), page as (
    select id from matched
    order by
      case when f_sort = 'rank' then qs_rank end asc nulls last,
      case when f_sort = 'rank_desc' then qs_rank end desc nulls last,
      case when f_sort = 'rank_the' then the_rank end asc nulls last,
      case when f_sort = 'rank_arwu' then arwu_rank end asc nulls last,
      case when f_sort = 'tuition' then tuition_usd end asc nulls last,
      case when f_sort = 'tuition_desc' then tuition_usd end desc nulls last,
      case when f_sort = 'admission' then acceptance_rate end asc nulls last,
      case when f_sort = 'admission_desc' then acceptance_rate end desc nulls last,
      case when f_sort = 'deadline' then next_deadline end asc nulls last,
      name, id
    limit 24 offset greatest(0, least(page_number - 1, 9999)) * 24
  )
  select jsonb_build_object(
    'ids', coalesce((select jsonb_agg(id) from page), '[]'::jsonb),
    'total', (select count(*) from matched),
    'medianTuition', (select percentile_cont(.5) within group (order by tuition_usd) from matched),
    'medianAdmission', (select percentile_cont(.5) within group (order by acceptance_rate) from matched),
    'countries', (select count(distinct country_code) from matched)));
end $function$;

revoke all on function public.explore_universities_v2(jsonb, integer) from public;
grant execute on function public.explore_universities_v2(jsonb, integer) to anon, authenticated;
