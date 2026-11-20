-- Additive performance pass (18 Oct 2026). No data, grants or policy semantics change.
--
-- 1. Foreign keys without a leading index force sequential scans on joins and on
--    every cascading delete of the referenced row (e.g. deleting a data source scans
--    every evidence table). Composite unique keys only help when the FK is the first
--    column, so these columns were not covered.
-- 2. Owner policies called auth.uid() bare, which Postgres re-evaluates per row.
--    Wrapping it in a scalar subquery lets the planner cache it once per statement
--    (Supabase advisor lint 0003_auth_rls_initplan). The predicates are identical.

-- Catalogue joins
create index if not exists university_programs_program_idx on public.university_programs(program_id);
create index if not exists university_scholarships_scholarship_idx on public.university_scholarships(scholarship_id);
create index if not exists universities_city_idx on public.universities(city_id) where city_id is not null;
create index if not exists campuses_city_idx on public.campuses(city_id) where city_id is not null;
create index if not exists admissions_program_idx on public.admissions(program_id) where program_id is not null;
create index if not exists costs_program_idx on public.costs(program_id) where program_id is not null;
create index if not exists deadlines_program_idx on public.deadlines(program_id) where program_id is not null;
create index if not exists requirements_program_idx on public.requirements(program_id) where program_id is not null;
create index if not exists external_rankings_source_idx on public.external_rankings(ranking_source_id);
create index if not exists media_professor_idx on public.media(professor_id) where professor_id is not null;

-- Evidence → data_sources (cascades and source-coverage queries)
create index if not exists admissions_source_idx on public.admissions(source_id);
create index if not exists costs_source_idx on public.costs(source_id);
create index if not exists data_points_source_idx on public.data_points(source_id);
create index if not exists deadlines_source_idx on public.deadlines(source_id);
create index if not exists departments_source_idx on public.departments(source_id);
create index if not exists exchange_rates_source_idx on public.exchange_rates(source_id);
create index if not exists financial_aid_source_idx on public.financial_aid(source_id);
create index if not exists ingestion_feeds_source_idx on public.ingestion_feeds(source_id);
create index if not exists learning_resources_source_idx on public.learning_resources(source_id);
create index if not exists media_source_idx on public.media(source_id);
create index if not exists outcomes_source_idx on public.outcomes(source_id);
create index if not exists professors_source_idx on public.professors(source_id);
create index if not exists ranking_entries_source_idx on public.ranking_entries(source_id);
create index if not exists requirements_source_idx on public.requirements(source_id);
create index if not exists research_source_idx on public.research(source_id);
create index if not exists research_metrics_source_idx on public.research_metrics(source_id);
create index if not exists scholarships_source_idx on public.scholarships(source_id);
create index if not exists university_programs_source_idx on public.university_programs(source_id);
create index if not exists university_programs_campus_idx on public.university_programs(campus_id) where campus_id is not null;

-- Review pipeline
create index if not exists source_records_import_idx on public.source_records(import_id);
create index if not exists source_records_source_idx on public.source_records(source_id);
create index if not exists data_points_observation_idx on public.data_points(observation_id) where observation_id is not null;
create index if not exists data_quality_checks_record_idx on public.data_quality_checks(record_id);
create index if not exists data_imports_source_idx on public.data_imports(source_id);
create index if not exists data_imports_created_by_idx on public.data_imports(created_by);
create index if not exists ingestion_jobs_import_idx on public.ingestion_jobs(import_id);
create index if not exists institution_candidates_university_idx on public.institution_candidates(university_id);
create index if not exists institution_candidates_reviewed_by_idx on public.institution_candidates(reviewed_by);
create index if not exists audit_logs_actor_idx on public.audit_logs(actor_id);
create index if not exists verification_logs_actor_idx on public.verification_logs(actor_id);

-- Private student data (account deletion cascades from auth.users / universities)
create index if not exists saved_universities_university_idx on public.saved_universities(university_id);
create index if not exists saved_scholarships_scholarship_idx on public.saved_scholarships(scholarship_id);
create index if not exists user_list_items_university_idx on public.user_list_items(university_id);
create index if not exists user_notes_university_idx on public.user_notes(university_id);
create index if not exists user_checklist_university_idx on public.user_checklist(university_id);
create index if not exists fit_scores_university_idx on public.fit_scores(university_id);
create index if not exists research_history_university_idx on public.research_history(university_id);
create index if not exists support_requests_user_idx on public.support_requests(user_id);
create index if not exists writing_draft_versions_user_idx on public.writing_draft_versions(user_id);

-- Owner policies: same predicates, evaluated once per statement.
do $$
declare t text;
begin
  foreach t in array array['saved_universities','saved_scholarships','comparison_lists','shared_comparisons',
    'saved_searches','user_lists','user_notes','user_checklist','fit_scores','research_history','notifications']
  loop
    if exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname='owner_access') then
      execute format('alter policy owner_access on public.%I using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    end if;
  end loop;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='user_list_items' and policyname='owner_access') then
    alter policy owner_access on public.user_list_items
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()) and exists (select 1 from public.user_lists l where l.id = list_id and l.user_id = (select auth.uid())));
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profile_owner') then
    alter policy profile_owner on public.profiles using (id = (select auth.uid()) or public.is_admin());
  end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profile_update') then
    alter policy profile_update on public.profiles using (id = (select auth.uid())) with check (id = (select auth.uid()));
  end if;
end $$;
