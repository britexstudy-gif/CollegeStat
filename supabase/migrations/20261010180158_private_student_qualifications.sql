-- Self-reported qualifications never enter the public catalogue or staff-readable preferences.
-- Additive, owner-only records. Edits are explicit new versions, not silent overwrites.
create table public.student_education (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  qualification text not null check((char_length(qualification) <= 120 and char_length(btrim(qualification)) > 0)),
  country_code text check(country_code is null or country_code ~ '^[A-Z]{2}$'),
  curriculum text not null check(curriculum in ('unknown','national','IB','A-level','other')),
  level text not null check(level in ('unknown','secondary','foundation','bachelor','master','doctorate','other')),
  status text not null check(status in ('unknown','studying','completed')),
  graduation_year integer check(graduation_year is null or graduation_year between 1900 and 2100),
  grade_label text check(grade_label is null or (char_length(grade_label) <= 80 and char_length(btrim(grade_label)) > 0)),
  grade_scale text check(grade_scale is null or (char_length(grade_scale) <= 120 and char_length(btrim(grade_scale)) > 0)),
  created_at timestamptz not null default now(),
  constraint education_grade_context check((grade_label is null) = (grade_scale is null))
);
create index student_education_owner_id on public.student_education(user_id,id);
alter table public.student_education enable row level security;
revoke all on public.student_education from public,anon,authenticated;
grant select,delete on public.student_education to authenticated;
grant insert(id,user_id,qualification,country_code,curriculum,level,status,graduation_year,grade_label,grade_scale) on public.student_education to authenticated;
create policy education_owner_read on public.student_education for select to authenticated using ((select auth.uid()) = user_id);
create policy education_owner_save on public.student_education for insert to authenticated with check ((select auth.uid()) = user_id);
create policy education_owner_remove on public.student_education for delete to authenticated using ((select auth.uid()) = user_id);

create table public.student_test_attempts (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check(kind in ('IELTS Academic','IELTS General','TOEFL iBT','Duolingo','SAT','ACT','other')),
  label text not null check((char_length(label) <= 120 and char_length(btrim(label)) > 0)),
  status text not null check(status in ('planned','registered','taken')),
  taken_on date,
  score_label text check(score_label is null or (char_length(score_label) <= 80 and char_length(btrim(score_label)) > 0)),
  scale_label text check(scale_label is null or (char_length(scale_label) <= 120 and char_length(btrim(scale_label)) > 0)),
  created_at timestamptz not null default now(),
  constraint test_score_context check((score_label is null) = (scale_label is null)),
  constraint test_taken_only check(status = 'taken' or (taken_on is null and score_label is null and scale_label is null))
);
create index student_test_attempts_owner_id on public.student_test_attempts(user_id,id);
alter table public.student_test_attempts enable row level security;
revoke all on public.student_test_attempts from public,anon,authenticated;
grant select,delete on public.student_test_attempts to authenticated;
grant insert(id,user_id,kind,label,status,taken_on,score_label,scale_label) on public.student_test_attempts to authenticated;
create policy tests_owner_read on public.student_test_attempts for select to authenticated using ((select auth.uid()) = user_id);
create policy tests_owner_save on public.student_test_attempts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy tests_owner_remove on public.student_test_attempts for delete to authenticated using ((select auth.uid()) = user_id);
comment on table public.student_education is 'Private self-reported education. No public/staff policy, score conversion, AI transmission or content audit trigger.';
comment on table public.student_test_attempts is 'Private self-reported test attempts. Preserve named variant, score scale and date; no official score verification, expiry inference or acceptance prediction.';
