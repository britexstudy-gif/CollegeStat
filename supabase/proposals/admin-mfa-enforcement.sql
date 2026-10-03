-- PENDING OWNER APPROVAL: validated locally; not installed on hosted Supabase.
-- Additive staff tooling. Existing records, RLS policies and ingestion history are retained.
create function private.require_admin_assurance() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  -- Authenticated catalogue writes include security-definer review/import RPCs.
  -- Trusted service-role workers and migration connections keep their existing permissions.
  if auth.role() in ('authenticated','anon') and
     not (public.is_admin() and coalesce(auth.jwt()->>'aal','') = 'aal2') then
    raise exception 'Administrator MFA required for catalogue writes' using errcode = '42501';
  end if;
  return null;
end $$;

-- The existing logo bucket's staff-write policy also requires session step-up.
create policy logo_mfa_insert on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'university-logos' or (select auth.jwt()->>'aal') = 'aal2');
create policy logo_mfa_update on storage.objects as restrictive for update to authenticated
using (bucket_id <> 'university-logos' or (select auth.jwt()->>'aal') = 'aal2')
with check (bucket_id <> 'university-logos' or (select auth.jwt()->>'aal') = 'aal2');
create policy logo_mfa_delete on storage.objects as restrictive for delete to authenticated
using (bucket_id <> 'university-logos' or (select auth.jwt()->>'aal') = 'aal2');
revoke all on function private.require_admin_assurance() from public, anon, authenticated;

do $$ declare t text; begin
  -- Existing administrative policies define catalogue scope; private student tables are excluded.
  for t in select distinct tablename from pg_policies
    where schemaname='public' and policyname in ('admin_insert','admin_all')
    and tablename not in ('profiles','audit_logs','rate_limits')
  loop
    execute format('create trigger require_staff_mfa before insert or update or delete on public.%I for each statement execute function private.require_admin_assurance()', t);
  end loop;
end $$;

