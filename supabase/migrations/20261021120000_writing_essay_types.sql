-- More application essay types for the writing tool (Common App, UCAS,
-- supplements, activities, graduate statements, scholarship essays).
alter table public.writing_draft_versions
  drop constraint if exists writing_draft_versions_format_check;
alter table public.writing_draft_versions
  add constraint writing_draft_versions_format_check check (format in (
    'statement','motivation','recommendation',
    'common_app','ucas','why_us','activities','short_answer','community',
    'sop','research','scholarship'
  ));
