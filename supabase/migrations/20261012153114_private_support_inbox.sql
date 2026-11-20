-- Private messages. Anonymous clients can submit through one bounded function,
-- but cannot list messages or choose an owner, state, timestamps or staff notes.
create table public.support_requests (
 id uuid primary key,
 user_id uuid references auth.users(id) on delete set null,
 kind text not null check(kind in ('question','issue','correction','feedback')),
 name text not null check(length(name)<=100),
 email text not null check(length(email)<=254),
 subject text not null check(length(subject) between 5 and 160),
 message text not null check(length(message) between 20 and 5000),
 page_path text not null check(length(page_path)<=500 and (page_path='' or (page_path ~ '^/[^/]' and page_path !~ '[?#\r\n]') or page_path='/')),
 status text not null default 'new' check(status in ('new','in_progress','resolved')),
 admin_note text not null default '' check(length(admin_note)<=3000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.support_requests enable row level security;
revoke all on public.support_requests from public, anon, authenticated;
grant select on public.support_requests to authenticated;
create policy staff_read on public.support_requests for select to authenticated
 using ((select public.is_admin()) and (select auth.jwt()->>'aal')='aal2' and (select public.admin_session_status()->>'active')='true');
create index support_inbox_status_date on public.support_requests(status,created_at desc,id);
create index support_inbox_date on public.support_requests(created_at desc,id);

create function private.submit_support_request(
 request_id uuid, request_kind text, sender_name text, sender_email text,
 request_subject text, request_message text, request_path text,
 review_consent boolean, honeypot text
) returns jsonb language plpgsql security definer set search_path='' as $support$
declare
 owner_id uuid := auth.uid(); existing public.support_requests%rowtype;
 clean_name text := btrim(sender_name); clean_email text := lower(btrim(sender_email));
 clean_subject text := btrim(request_subject); clean_message text := btrim(request_message);
 received public.support_requests%rowtype;
begin
 if request_id is null or review_consent is distinct from true or honeypot is distinct from ''
  or request_kind is null or request_kind not in ('question','issue','correction','feedback')
  or clean_name is null or length(clean_name)>100 or clean_email is null or length(clean_email)>254
  or (clean_email<>'' and clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
  or (owner_id is null and clean_email='')
  or clean_subject is null or length(clean_subject) not between 5 and 160
  or clean_message is null or length(clean_message) not between 20 and 5000
  or request_path is null or length(request_path)>500
  or (request_path<>'' and (request_path !~ '^/([^/]|$)' or request_path ~ '[?#\r\n]'))
 then raise exception 'Invalid support message' using errcode='22023'; end if;
 -- One lock order for all submissions: bounded global minute/day counters, then sender.
 -- The id lock makes retrying an identical message idempotent, including anonymous retries.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(request_id::text,741));
 select * into existing from public.support_requests r where r.id=request_id;
 if found then
  if existing.user_id is not distinct from owner_id and existing.kind=request_kind
   and existing.name=clean_name and existing.email=clean_email and existing.subject=clean_subject
   and existing.message=clean_message and existing.page_path=request_path
  then return pg_catalog.jsonb_build_object('id',existing.id,'status',existing.status,'created_at',existing.created_at);
  end if;
  return pg_catalog.jsonb_build_object('error_code','conflict');
 end if;
 if not public.consume_rate_limit('support:minute',10,60)
  or not public.consume_rate_limit('support:day',200,86400)
  or not public.consume_rate_limit('support:sender:'||coalesce(owner_id::text,pg_catalog.md5(clean_email)),5,3600)
 then return pg_catalog.jsonb_build_object('error_code','limit'); end if;
 insert into public.support_requests(id,user_id,kind,name,email,subject,message,page_path)
 values(request_id,owner_id,request_kind,clean_name,clean_email,clean_subject,clean_message,request_path)
 returning * into received;
 return pg_catalog.jsonb_build_object('id',received.id,'status',received.status,'created_at',received.created_at);
end;
$support$;
revoke all on function private.submit_support_request(uuid,text,text,text,text,text,text,boolean,text) from public,anon,authenticated,service_role;
grant execute on function private.submit_support_request(uuid,text,text,text,text,text,text,boolean,text) to anon,authenticated;
grant usage on schema private to anon,authenticated;
create function public.submit_support_request(
 request_id uuid, request_kind text, sender_name text, sender_email text,
 request_subject text, request_message text, request_path text,
 review_consent boolean, honeypot text
) returns jsonb language sql security invoker set search_path='' as $support$
 select private.submit_support_request(request_id,request_kind,sender_name,sender_email,request_subject,request_message,request_path,review_consent,honeypot);
$support$;
revoke all on function public.submit_support_request(uuid,text,text,text,text,text,text,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.submit_support_request(uuid,text,text,text,text,text,text,boolean,text) to anon,authenticated;

create function private.review_support_request(request_id uuid,next_status text,internal_note text,expected_update timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $support$
declare result public.support_requests%rowtype;
begin
 if not public.is_admin() or auth.jwt()->>'aal' is distinct from 'aal2'
  or public.admin_session_status()->>'active' is distinct from 'true'
 then raise exception 'Verified administrator required' using errcode='42501'; end if;
 if next_status is null or next_status not in ('new','in_progress','resolved')
  or internal_note is null or length(internal_note)>3000 or expected_update is null
 then raise exception 'Invalid inbox review' using errcode='22023'; end if;
 update public.support_requests set status=next_status,admin_note=btrim(internal_note),updated_at=clock_timestamp()
 where id=request_id and updated_at=expected_update returning * into result;
 if not found then return null; end if;
 return to_jsonb(result);
end;
$support$;
revoke all on function private.review_support_request(uuid,text,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function private.review_support_request(uuid,text,text,timestamptz) to authenticated;
create function public.review_support_request(request_id uuid,next_status text,internal_note text,expected_update timestamptz)
returns jsonb language sql security invoker set search_path='' as $support$
 select private.review_support_request(request_id,next_status,internal_note,expected_update);
$support$;
revoke all on function public.review_support_request(uuid,text,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.review_support_request(uuid,text,text,timestamptz) to authenticated;
create trigger audit_changes after update or delete on public.support_requests for each row execute function public.audit_content();
comment on table public.support_requests is 'Private contact and issue messages. Email is sender-provided and unverified. Staff notes are internal; no email is sent automatically.';
