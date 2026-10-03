-- Global identity data is reviewed separately from numerical observations.
create table public.institution_candidates (
 id uuid primary key default gen_random_uuid(),
 system text not null default 'ror' check(system='ror'),
 external_id text not null check(external_id ~ '^https://ror.org/0[a-z0-9]{8}$'),
 name text not null, country_code text not null check(country_code ~ '^[A-Z]{2}$'),
 source_url text not null check(source_url=external_id),
 dataset_url text not null check(dataset_url ~ '^https://'),
 source_modified_at date not null, source_metadata jsonb not null,
 proposed jsonb not null check(jsonb_typeof(proposed)='object'),
 fingerprint text generated always as (md5(proposed::text || source_metadata::text)) stored,
 status text not null default 'pending' check(status in ('pending','accepted','rejected')),
 university_id uuid references public.universities,
 reviewed_by uuid references auth.users, reviewed_at timestamptz,
 created_at timestamptz not null default now(),
 unique(system,external_id,fingerprint)
);
alter table public.institution_candidates enable row level security;
grant select on public.institution_candidates to authenticated;
create policy admin_read on public.institution_candidates for select to authenticated using(public.is_admin());
create trigger audit_changes after insert or update or delete on public.institution_candidates for each row execute function public.audit_content();

create function public.stage_institution_candidates(records jsonb, dataset text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; accepted integer:=0; affected integer;
begin
 if coalesce(current_setting('role',true),'') <> 'service_role' and not public.is_admin() then raise exception 'Administrator required'; end if;
 if records is null or jsonb_typeof(records)<>'array' or jsonb_array_length(records) not between 1 and 100 or octet_length(records::text)>1000000 then raise exception 'Invalid batch'; end if;
 if dataset is null or dataset !~ '^https://(zenodo[.]org|doi[.]org|github[.]com/ror-community)/' then raise exception 'Dataset release URL required'; end if;
 for r in select value from jsonb_array_elements(records) loop
  if r->'proposed'->>'name' is distinct from r->>'name' or r->'proposed'->>'country_code' is distinct from r->>'country_code' or length(r->>'name') not between 1 and 500 then raise exception 'Invalid identity'; end if;
  insert into public.institution_candidates(external_id,name,country_code,source_url,dataset_url,source_modified_at,source_metadata,proposed)
  values(r->>'external_id',r->>'name',r->>'country_code',r->>'source_url',dataset,(r->>'source_modified_at')::date,r->'source_metadata',r->'proposed') on conflict do nothing;
  get diagnostics affected=row_count; accepted:=accepted+affected;
 end loop;
 return jsonb_build_object('accepted',accepted,'duplicates',jsonb_array_length(records)-accepted);
end $$;

create function public.review_institution_candidate(candidate uuid, accept boolean, existing uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare r public.institution_candidates; target uuid; v_slug text;
begin
 if not public.is_admin() then raise exception 'Administrator required'; end if;
 select * into strict r from public.institution_candidates where id=candidate for update;
 if r.status <> 'pending' then raise exception 'Already reviewed'; end if;
 if accept is null then raise exception 'Decision required'; end if;
 if accept then
  -- Serialize identity claims across different versions of the same ROR record.
  perform pg_advisory_xact_lock(hashtextextended(r.external_id,0));
  select university_id into target from public.external_identifiers where system='ror' and external_id=r.external_id;
  if target is not null and (existing is null or existing<>target) then raise exception 'Link the existing identity explicitly'; end if;
  if existing is not null then
   perform 1 from public.universities where id=existing;
   if not found then raise exception 'University not found'; end if;
   target:=existing;
  else
   if exists(select 1 from public.universities u where (lower(u.name)=lower(r.name) and u.country_code=r.country_code) or (u.website is not null and r.proposed->>'website' is not null and rtrim(lower(u.website),'/')=rtrim(lower(r.proposed->>'website'),'/'))) then raise exception 'Possible duplicate: link an existing university'; end if;
   v_slug:=trim(both '-' from regexp_replace(lower(r.name),'[^a-z0-9]+','-','g'));
   v_slug:=left(coalesce(nullif(v_slug,''),'university'),150)||'-'||split_part(r.external_id,'/',4);
   insert into public.universities(name,slug,short_name,country_code,city,region,website,reference_url,reference_retrieved_at,published)
   values(r.name,v_slug,r.proposed->>'short_name',r.country_code,r.proposed->>'city',r.proposed->>'region',r.proposed->>'website',r.source_url,r.created_at,false) returning id into target;
   insert into public.university_aliases(university_id,alias) select target,value from jsonb_array_elements_text(r.proposed->'aliases') on conflict do nothing;
  end if;
  -- Linking preserves the current university; imported changes remain in this versioned record.
  insert into public.external_identifiers(university_id,system,external_id) values(target,'ror',r.external_id) on conflict(system,external_id) do nothing;
 end if;
 update public.institution_candidates set status=case when accept then 'accepted' else 'rejected' end,university_id=target,reviewed_by=auth.uid(),reviewed_at=now() where id=candidate;
 return target;
end $$;
revoke all on function public.stage_institution_candidates(jsonb,text),public.review_institution_candidate(uuid,boolean,uuid) from public,anon;
grant execute on function public.stage_institution_candidates(jsonb,text) to service_role,authenticated;
grant execute on function public.review_institution_candidate(uuid,boolean,uuid) to authenticated;
