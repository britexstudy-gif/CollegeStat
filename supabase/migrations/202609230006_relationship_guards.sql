-- A vocabulary entry is not evidence that an institution offers the program.
alter table public.university_programs add column source_id uuid references public.data_sources;
alter table public.university_programs add column source_url text check(source_url ~ '^https://');
alter table public.university_programs add column verification_status text not null default 'needs_review' check(verification_status in ('verified','needs_review','outdated','missing_source'));
alter table public.university_programs add column verified_at timestamptz;
alter table public.university_programs add constraint verified_program_source check(verification_status<>'verified' or (source_id is not null and source_url is not null and verified_at is not null));
drop policy public_read on public.university_programs;
create policy public_read on public.university_programs for select to anon,authenticated using(verification_status='verified' and exists(select 1 from public.universities u where u.id=university_id and u.published));
create trigger invalidate_verification before update on public.university_programs for each row execute function public.invalidate_verification();
alter table public.professors add constraint professor_university_identity unique(id,university_id);
alter table public.media add constraint faculty_media_same_university foreign key(professor_id,university_id) references public.professors(id,university_id);
create function public.check_deadline_timezone() returns trigger language plpgsql set search_path='' as $$ begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then raise exception 'Unknown IANA timezone'; end if; return new;
end $$;
create trigger valid_timezone before insert or update on public.deadlines for each row execute function public.check_deadline_timezone();
create function public.consume_admin_limit() returns boolean language plpgsql security definer set search_path='' as $$ begin
 if not public.is_admin() then raise exception 'Administrator required'; end if;
 return public.consume_rate_limit('admin:'||auth.uid()::text,60,60);
end $$;
revoke all on function public.consume_admin_limit() from public;
grant execute on function public.consume_admin_limit() to authenticated;
-- Direct Data API staging observes the same fixed, user-bound budget as HTTP imports.
create function public.limit_imports() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is not null and not public.consume_rate_limit('import:'||auth.uid()::text,10,60) then raise exception 'Import limit reached'; end if; return new;
end $$;
create trigger import_budget before insert on public.data_imports for each row execute function public.limit_imports();
