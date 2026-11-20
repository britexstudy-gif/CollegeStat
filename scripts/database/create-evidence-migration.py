"""Generate the additive migration from the existing search/review definitions.
The CLI is not installed in this workspace; no remote connection is made here.
"""
from pathlib import Path

root = Path(__file__).resolve().parents[2]
target = root / 'supabase/migrations/202610050001_evidence_scope.sql'
search = (root / 'supabase/migrations/20261003060621_hosted_public_views.sql').read_text().split('-- Send only ranking evidence')[0].strip()
old = "r.program_id is null and r.kind='IELTS' and r.verification_status='verified'"
assert search.count(old) == 1
search = search.replace(old, "r.program_id is null and r.kind='IELTS' and r.verification_status='verified' and coalesce(r.evidence->>'university_wide','true')<>'false'")
review = (root / 'supabase/migrations/202609230003_intelligence.sql').read_text().split('create or replace function public.approve_observation')[1].split('create function public.reject_observation')[0]
review = 'create or replace function public.approve_observation' + review
review = review.replace('notes,canonical)', 'notes,canonical,evidence)')
review = review.replace("r.confidence,r.notes,true);", "r.confidence,r.notes,true,coalesce(r.raw_value->'evidence','{}'::jsonb));")
tables = ['data_points','admissions','requirements','deadlines','costs','financial_aid','university_programs','research_metrics','outcomes','scholarships','ranking_entries','media']
sql = '-- Add evidence to existing equivalents; preserve all rows, identities, URLs and RLS.\n'
for table in tables:
    sql += f"alter table public.{table} add column evidence jsonb not null default '{{}}'::jsonb check(jsonb_typeof(evidence)='object' and octet_length(evidence::text)<=16000);\n"
sql += """
-- Fields describe this university's offering, never a historical completion row.
alter table public.university_programs
 add column reporting_year integer check(reporting_year between 1900 and 2100),
 add column duration_months integer check(duration_months between 1 and 360),
 add column campus_id uuid references public.campuses,
 add column intakes text[] not null default '{}',
 add column availability text not null default 'unknown' check(availability in ('unknown','current','historical'));
-- Only published parents expose new normalized research and outcomes evidence.
alter policy public_read on public.research_metrics using(verification_status='verified' and exists(select 1 from public.universities u where u.id=university_id and u.published));
alter policy public_read on public.outcomes using(verification_status='verified' and exists(select 1 from public.universities u where u.id=university_id and u.published));
create index if not exists research_metrics_institution_period on public.research_metrics(university_id,period);
create index if not exists outcomes_institution_year on public.outcomes(university_id,year);
"""
target.write_text(sql + '\n' + search + '\n\n' + review)
print(target.relative_to(root))
