-- A date-only source must never become an invented midnight deadline.
alter table public.deadlines alter column due_at drop not null;
alter table public.deadlines add column due_date date;
alter table public.deadlines add constraint deadline_precision check (
  (due_at is not null and due_date is null) or
  (due_at is null and due_date is not null)
);
comment on column public.deadlines.due_date is 'Provider gives a date but no reliable cutoff time. Do not infer a timestamp.';
