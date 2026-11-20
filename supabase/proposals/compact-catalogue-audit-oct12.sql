-- Preserve all existing logs and triggers. Reduce only future public observation
-- INSERTs and review-state-only UPDATEs. Content edits and DELETEs retain full rows.
create or replace function public.audit_content()
returns trigger language plpgsql security definer set search_path=''
as $audit$
declare
 previous jsonb := case when TG_OP<>'INSERT' then to_jsonb(OLD) end;
 current_row jsonb := case when TG_OP<>'DELETE' then to_jsonb(NEW) end;
 compact boolean;
 metadata_keys constant text[] := array['status','verification_status','verified_at','updated_at','canonical','confidence','reviewed_by','reviewed_at','review_notes'];
 keep_keys constant text[] := array['id','university_id','source_id','import_id','metric','year','value','normalized_value','text_value','unit','confidence','status','verification_status','verified_at','canonical','source_url','retrieved_at','updated_at','reviewed_by','reviewed_at','review_notes'];
 item jsonb;
 old_audit jsonb;
 new_audit jsonb;
begin
 compact := TG_TABLE_SCHEMA='public' and TG_TABLE_NAME in ('source_records','data_points') and
  (TG_OP='INSERT' or (TG_OP='UPDATE' and (previous-metadata_keys)=(current_row-metadata_keys)));
 old_audit := previous; new_audit := current_row;
 if compact then
  if previous is not null then
   select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into item from jsonb_each(previous) where key=any(keep_keys);
   old_audit := item||jsonb_build_object('representation','catalogue_reference_v1','row_md5',md5(previous::text),'payload_bytes',octet_length(previous::text));
  end if;
  if current_row is not null then
   select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into item from jsonb_each(current_row) where key=any(keep_keys);
   new_audit := item||jsonb_build_object('representation','catalogue_reference_v1','row_md5',md5(current_row::text),'payload_bytes',octet_length(current_row::text));
  end if;
 end if;
 insert into public.audit_logs(actor_id,table_name,record_id,operation,old_value,new_value)
 values(auth.uid(),TG_TABLE_NAME,coalesce(current_row->>'id',previous->>'id'),TG_OP,old_audit,new_audit);
 if TG_OP='DELETE' then return OLD; end if;
 return NEW;
end;
$audit$;
comment on function public.audit_content() is 'Existing audit trail preserved. Public source/data observation inserts and review-state-only changes use a versioned row reference/digest; actual content edits and deletion preserve full old/new evidence. Other tables retain existing full-row auditing.';
