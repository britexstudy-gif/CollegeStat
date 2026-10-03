-- Preserve downloaded observations alongside a directory identity. User-owned
-- tables continue to reference universities and retain their existing RLS.
alter table public.universities add column if not exists imported_records jsonb not null default '[]'::jsonb check(jsonb_typeof(imported_records)='array');
-- Some official websites are supplied as HTTP in the source directory.
alter table public.universities drop constraint if exists universities_website_check;
alter table public.universities add constraint universities_website_check check(website ~ '^https?://');
