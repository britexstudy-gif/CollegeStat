-- Non-destructive administrative step-up and idle boundary. No catalogue/audit data changes.
create table private.staff_sessions (
  session_id uuid primary key,
  user_id uuid not null,
  factor_id uuid not null,
  verified_at bigint not null check (verified_at > 0),
  last_active_at timestamptz not null,
  closed_at timestamptz
);
alter table private.staff_sessions enable row level security;
revoke all on private.staff_sessions from public, anon, authenticated, service_role;

create function private.staff_identity() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare claims jsonb := auth.jwt(); sid uuid; verified bigint; factor uuid;
begin
  if auth.uid() is null or claims->>'role' is distinct from 'authenticated'
     or claims->>'aal' is distinct from 'aal2'
     or not exists (select 1 from public.profiles where id=auth.uid() and role='admin')
     or jsonb_typeof(claims->'amr') is distinct from 'array'
  then return null; end if;
  begin sid := (claims->>'session_id')::uuid; exception when invalid_text_representation then return null; end;
  if sid is null then return null; end if;
  select f.id into factor from auth.sessions s join auth.mfa_factors f on f.id=s.factor_id and f.user_id=s.user_id
    where s.id=sid and s.user_id=auth.uid() and s.aal='aal2'
    and (s.not_after is null or s.not_after>statement_timestamp())
    and f.factor_type='totp' and f.status='verified';
  if factor is null then return null; end if;
  select max((item->>'timestamp')::bigint) into verified
  from jsonb_array_elements(claims->'amr') item
  where item->>'method'='totp' and jsonb_typeof(item->'timestamp')='number'
    and item->>'timestamp' ~ '^[0-9]{1,12}$';
  if verified is null or verified>extract(epoch from statement_timestamp())::bigint+30 then return null; end if;
  return jsonb_build_object('session_id',sid,'user_id',auth.uid(),'factor_id',factor,'verified_at',verified);
end $$;

create function private.staff_session_receipt(is_active boolean, expires timestamptz) returns jsonb
language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object('active',is_active,'server_time',statement_timestamp(),'expires_at',expires)
$$;

create function private.staff_session_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare identity jsonb := private.staff_identity(); expires timestamptz;
begin
  if identity is not null then
    select last_active_at+interval '15 minutes' into expires from private.staff_sessions
    where session_id=(identity->>'session_id')::uuid and user_id=auth.uid()
    and verified_at=(identity->>'verified_at')::bigint and closed_at is null
    and factor_id=(identity->>'factor_id')::uuid;
  end if;
  return private.staff_session_receipt(coalesce(expires>statement_timestamp(),false),expires);
end $$;

create function private.staff_session_start() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare identity jsonb := private.staff_identity(); existing private.staff_sessions; verified bigint;
begin
  if identity is null then raise exception 'Verified administrator authenticator required' using errcode='42501'; end if;
  verified := (identity->>'verified_at')::bigint;
  if verified < extract(epoch from statement_timestamp()-interval '5 minutes')::bigint then
    raise exception 'Use a fresh authenticator code' using errcode='42501';
  end if;
  -- Serialize competing first opens without permitting a caller-selected identity.
  perform pg_advisory_xact_lock(hashtextextended(identity->>'session_id',0));
  select * into existing from private.staff_sessions where session_id=(identity->>'session_id')::uuid for update;
  if found then
    if existing.user_id<>auth.uid() then raise exception 'Session owner mismatch' using errcode='42501'; end if;
    if existing.closed_at is null and existing.last_active_at+interval '15 minutes'>statement_timestamp()
       and existing.verified_at=verified and existing.factor_id=(identity->>'factor_id')::uuid
       then return private.staff_session_status(); end if;
    if verified<=existing.verified_at then raise exception 'Use a new authenticator code after inactivity' using errcode='42501'; end if;
  end if;
  insert into private.staff_sessions(session_id,user_id,factor_id,verified_at,last_active_at)
  values((identity->>'session_id')::uuid,auth.uid(),(identity->>'factor_id')::uuid,verified,statement_timestamp())
  on conflict(session_id) do update set factor_id=excluded.factor_id,verified_at=excluded.verified_at,last_active_at=excluded.last_active_at,closed_at=null;
  return private.staff_session_status();
end $$;

create function private.staff_session_touch() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare identity jsonb := private.staff_identity();
begin
  if identity is null then raise exception 'Verified administrator authenticator required' using errcode='42501'; end if;
  update private.staff_sessions set last_active_at=statement_timestamp()
  where session_id=(identity->>'session_id')::uuid and user_id=auth.uid()
    and verified_at=(identity->>'verified_at')::bigint and closed_at is null
    and factor_id=(identity->>'factor_id')::uuid
    and last_active_at+interval '15 minutes'>statement_timestamp();
  if not found then raise exception 'Administrator session expired' using errcode='42501'; end if;
  return private.staff_session_status();
end $$;

create function private.staff_session_end() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare identity jsonb := private.staff_identity();
begin
  if identity is not null then
    update private.staff_sessions set closed_at=statement_timestamp()
    where session_id=(identity->>'session_id')::uuid and user_id=auth.uid()
      and verified_at=(identity->>'verified_at')::bigint;
  end if;
  return private.staff_session_receipt(false,null);
end $$;

-- All existing catalogue RLS, staff RPCs and logo_storage policies use this helper.
-- Own-profile reads remain available through their separate id=auth.uid() branch.
create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select (private.staff_session_status()->>'active')::boolean
$$;

create function public.admin_session_status() returns jsonb language sql stable security invoker set search_path='' as $$ select private.staff_session_status() $$;
create function public.admin_session_start() returns jsonb language sql volatile security invoker set search_path='' as $$ select private.staff_session_start() $$;
create function public.admin_session_touch() returns jsonb language sql volatile security invoker set search_path='' as $$ select private.staff_session_touch() $$;
create function public.admin_session_end() returns jsonb language sql volatile security invoker set search_path='' as $$ select private.staff_session_end() $$;

revoke all on function private.staff_identity(),private.staff_session_receipt(boolean,timestamptz),private.staff_session_status(),private.staff_session_start(),private.staff_session_touch(),private.staff_session_end() from public,anon,authenticated,service_role;
revoke all on function public.admin_session_status(),public.admin_session_start(),public.admin_session_touch(),public.admin_session_end() from public,anon,authenticated,service_role;
grant execute on function private.staff_session_status(),private.staff_session_start(),private.staff_session_touch(),private.staff_session_end() to authenticated;
grant execute on function public.admin_session_status(),public.admin_session_start(),public.admin_session_touch(),public.admin_session_end() to authenticated;
