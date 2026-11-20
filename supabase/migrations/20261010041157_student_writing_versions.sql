-- Personal writing is separate from sourced university facts and content audits.
-- Every explicit save creates an immutable version; retries reuse its client UUID.
create table public.writing_draft_versions (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  format text not null check (format in ('statement','motivation','recommendation')),
  body text not null check (char_length(body) between 1 and 20000 and char_length(btrim(body)) > 0),
  created_at timestamptz not null default now()
);
create index writing_draft_versions_owner_format_time
  on public.writing_draft_versions(user_id,format,created_at desc,id desc);
alter table public.writing_draft_versions enable row level security;
revoke all on table public.writing_draft_versions from public,anon,authenticated;
grant select,delete on table public.writing_draft_versions to authenticated;
grant insert(id,user_id,format,body) on public.writing_draft_versions to authenticated;
create policy writing_versions_owner_read
  on public.writing_draft_versions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy writing_versions_owner_save
  on public.writing_draft_versions for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy writing_versions_owner_remove
  on public.writing_draft_versions for delete to authenticated
  using ((select auth.uid()) = user_id);
comment on table public.writing_draft_versions is
  'Private, explicitly saved student writing versions. No public/staff policy, AI transmission, or content audit trigger.';
