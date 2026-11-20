-- A fixed owner quota, accessible through the authenticated caller without a service key.
-- Reuse the existing rate-limit storage. No prompts, essays or model responses are stored.
create or replace function public.consume_student_ai_limit()
returns boolean language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid();
begin
 if owner_id is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if not public.consume_rate_limit('student-ai:'||owner_id::text,12,3600) then return false; end if;
 return public.consume_rate_limit('student-ai:app-daily',50,86400);
end $$;
revoke all on function public.consume_student_ai_limit() from public,anon;
grant execute on function public.consume_student_ai_limit() to authenticated;
comment on function public.consume_student_ai_limit() is '12 student AI requests per account per hour and 50 app-wide per rolling day. Fixed owner and quotas; no caller-controlled buckets, limits or private content.';
