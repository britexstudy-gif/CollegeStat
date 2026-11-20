-- NOT INSTALLED. Separate, explicit owner approval is required: this changes the
-- shared predicate used by existing catalogue RLS and administrative RPCs.
-- Owner chose "Keep the current app protection" on 12 October 2026. Do not apply.
-- Requires the already-installed staff_app_session_lifecycle migration.
-- Existing service-role table BYPASSRLS is retained, but any job that deliberately
-- calls the admin predicate or impersonates an admin needs independent review.
-- Ordinary users, published rows and existing audit contents are not changed.
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select (private.staff_session_status()->>'active')::boolean
$$;
