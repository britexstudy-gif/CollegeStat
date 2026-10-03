-- Public institutional links and registry identity; no user or provider secrets.
alter table public.universities
  add column if not exists application_url text check(application_url ~ '^https?://'),
  add column if not exists financial_aid_url text check(financial_aid_url ~ '^https?://'),
  add column if not exists net_price_url text check(net_price_url ~ '^https?://'),
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists identity_release text,
  add column if not exists identifiers jsonb not null default '{}'::jsonb check(jsonb_typeof(identifiers)='object'),
  add column if not exists aliases jsonb not null default '[]'::jsonb check(jsonb_typeof(aliases)='array');
