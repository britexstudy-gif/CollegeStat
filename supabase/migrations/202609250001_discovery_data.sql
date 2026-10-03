-- Extends the existing reviewed catalogue. No proprietary ranking positions are seeded.
alter table public.external_identifiers drop constraint if exists external_identifiers_system_check;
alter table public.external_identifiers add constraint external_identifiers_system_check
  check(system in ('ipeds','opeid','ror','openalex','wikidata','ukprn','uk_provider','ucas'));

create table public.countries(code text primary key check(code ~ '^[A-Z]{2}$'), name text not null);
create table public.cities(id uuid primary key default gen_random_uuid(), country_code text not null references public.countries(code), name text not null, region text, geonames_id bigint, unique(country_code,name,region));
alter table public.universities add column city_id uuid references public.cities(id);
alter table public.campuses add column city_id uuid references public.cities(id);

create table public.ranking_sources(
 id text primary key, name text not null, official_url text not null check(official_url ~ '^https://'),
 terms_url text check(terms_url ~ '^https://'), access_policy text not null check(access_policy in ('open','licensed','link_only')),
 license_note text not null, checked_at date not null
);
insert into public.ranking_sources values
 ('qs','QS World University Rankings','https://www.topuniversities.com/world-university-rankings','https://www.topuniversities.com/user-agreement','link_only','No bulk import or automated collection without a suitable licence.',current_date),
 ('the','Times Higher Education World University Rankings','https://www.timeshighereducation.com/world-university-rankings','https://www.timeshighereducation.com/website-terms-of-use','link_only','Permission requested by publisher for reproduction or distribution.',current_date),
 ('arwu','ShanghaiRanking ARWU','https://www.shanghairanking.com/rankings/arwu','https://www.shanghairanking.com/about-sr','link_only','Ranking tables and indicators are publisher intellectual property; no redistribution permission established.',current_date),
 ('leiden-open','CWTS Leiden Ranking Open Edition','https://open.leidenranking.com/','https://open.leidenranking.com/resources','open','Open Edition results are published under CC0; retain edition and indicator definitions.',current_date);
create table public.external_rankings(
 id uuid primary key default gen_random_uuid(), university_id uuid not null references public.universities(id) on delete cascade,
 ranking_source_id text not null references public.ranking_sources(id), edition text not null,
 source_url text not null check(source_url ~ '^https://'), retrieved_at timestamptz,
 source_record_id text, licensed_fields jsonb not null default '{}'::jsonb,
 license_note text not null, unique(university_id,ranking_source_id,edition)
);
create table public.outcomes(
 id uuid primary key default gen_random_uuid(), university_id uuid not null references public.universities(id) on delete cascade,
 metric text not null, value numeric, unit text, cohort text, year integer not null,
 source_id uuid not null references public.data_sources(id), source_url text not null check(source_url ~ '^https://'),
 source_record_id text, retrieved_at timestamptz not null, last_verified_at timestamptz,
 verification_status text not null default 'needs_review', license_note text,
 unique(university_id,metric,year,cohort,source_id)
);
create table public.research_metrics(
 id uuid primary key default gen_random_uuid(), university_id uuid not null references public.universities(id) on delete cascade,
 metric text not null, value numeric not null, unit text, field text, period text not null, edition text,
 source_id uuid not null references public.data_sources(id), source_url text not null check(source_url ~ '^https://'),
 source_record_id text, retrieved_at timestamptz not null, last_verified_at timestamptz,
 verification_status text not null default 'needs_review', license_note text,
 unique(university_id,metric,period,field,source_id)
);
create view public.university_images with(security_invoker=true) as
 select id,university_id,kind,url,alt,creator,license,license_url,source_id,source_url,verified_at as last_verified_at
 from public.media where professor_id is null;
create table public.collegestat_scores(
 id uuid primary key default gen_random_uuid(), university_id uuid not null references public.universities(id) on delete cascade,
 framework_version text not null, edition text not null, dimension text not null,
 score numeric check(score between 0 and 100), coverage numeric not null check(coverage between 0 and 1),
 inputs jsonb not null, weights jsonb not null, methodology_url text,
 calculated_at timestamptz not null default now(), published boolean not null default false,
 unique(university_id,framework_version,edition,dimension),
 check(not published or (score is not null and coverage >= 0.5 and jsonb_array_length(inputs) > 0))
);
alter table public.ranking_sources enable row level security;
alter table public.external_rankings enable row level security;
alter table public.outcomes enable row level security;
alter table public.research_metrics enable row level security;
alter table public.collegestat_scores enable row level security;
alter table public.countries enable row level security;
alter table public.cities enable row level security;
create policy public_read on public.ranking_sources for select using(true);
create policy public_read on public.external_rankings for select using(true);
create policy public_read on public.outcomes for select using(verification_status='verified');
create policy public_read on public.research_metrics for select using(verification_status='verified');
create policy public_read on public.collegestat_scores for select using(published);
create policy public_read on public.countries for select using(true);
create policy public_read on public.cities for select using(true);
grant select on public.ranking_sources,public.external_rankings,public.outcomes,public.research_metrics,public.collegestat_scores,public.countries,public.cities,public.university_images to anon,authenticated;
