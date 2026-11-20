-- Reuse the existing identity crosswalk and review queue. No merges or deletions.
alter table public.external_identifiers
 add column source_url text check(source_url ~ '^https://'),
 add column retrieved_at timestamptz,
 add column evidence jsonb not null default '{}'::jsonb check(jsonb_typeof(evidence)='object' and octet_length(evidence::text)<=16000);
-- Coverage and review queries must remain bounded as observation history grows.
create index if not exists source_records_institution_status on public.source_records(university_id,status);
create index if not exists source_records_review_date on public.source_records(status,retrieved_at desc);
create index if not exists quality_checks_unresolved on public.data_quality_checks(resolved) where not resolved;
