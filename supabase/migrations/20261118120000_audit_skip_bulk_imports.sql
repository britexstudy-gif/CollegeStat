-- Bulk catalogue imports run without a signed-in user (service role) and were copying every
-- imported row into audit_logs (178k rows, 420 MB, cleaned on 2026-11-18). Keep the audit trail
-- for real people: log a change only when there is an actor, except support requests, which are
-- always logged.
create or replace function public.audit_content()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null and TG_TABLE_NAME <> 'support_requests' then
    return coalesce(new, old);
  end if;
  insert into public.audit_logs(actor_id, table_name, record_id, operation, old_value, new_value)
  values (
    auth.uid(),
    TG_TABLE_NAME,
    coalesce(new.id, old.id)::text,
    TG_OP,
    case when TG_OP <> 'INSERT' then to_jsonb(old) end,
    case when TG_OP <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end
$function$;
