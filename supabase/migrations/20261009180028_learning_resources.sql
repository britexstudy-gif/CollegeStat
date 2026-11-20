-- Versioned official resource links and authored guidance; no copied question banks.
-- No existing resource-equivalent table was present in the inspected schema.
create table public.learning_resources (
 id uuid primary key,
 slug text not null check(slug ~ '^[a-z0-9-]{2,100}$'),
 title text not null check(length(title) between 1 and 200),
 provider text not null check(length(provider) between 1 and 200),
 kind text not null check(kind in ('practice','destination')),
 subject text not null check(length(subject) between 1 and 100),
 url text not null check(url ~ '^https://'),
 summary text not null check(length(summary) between 1 and 1500),
 access text not null,
 country_code text check(country_code ~ '^[A-Z]{2}$'),
 population text not null,
 publication_year integer check(publication_year between 1900 and 2100),
 retrieved_at timestamptz not null,
 verified_at timestamptz,
 verification_state text not null default 'needs_review' check(verification_state in ('needs_review','verified','rejected')),
 reuse_mode text not null default 'link_metadata_only' check(reuse_mode='link_metadata_only'),
 steps jsonb not null default '[]' check(jsonb_typeof(steps)='array' and octet_length(steps::text)<=8000),
 evidence jsonb not null check(jsonb_typeof(evidence)='object' and octet_length(evidence::text)<=16000),
 source_id uuid not null references public.data_sources,
 published boolean not null default false,
 created_at timestamptz not null default now(),
 unique(slug,retrieved_at),
 check(verification_state<>'verified' or verified_at is not null),
 check(evidence @> '{"content_imported":false}'::jsonb)
);
alter table public.learning_resources enable row level security;
grant select on public.learning_resources to anon,authenticated;
grant insert,update,delete on public.learning_resources to authenticated;
create policy public_read on public.learning_resources for select to anon,authenticated using(published and verification_state='verified');
create policy admin_read on public.learning_resources for select to authenticated using(public.is_admin());
create policy admin_write on public.learning_resources for all to authenticated using(public.is_admin()) with check(public.is_admin());
create index learning_resources_public_subject on public.learning_resources(kind,subject,retrieved_at desc) where published and verification_state='verified';
create trigger audit_changes after insert or update or delete on public.learning_resources for each row execute function public.audit_content();
