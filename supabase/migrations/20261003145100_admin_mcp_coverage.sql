-- Additive read-only staff coverage RPC. No existing data or permissions are changed.
create function public.admin_university_coverage(target uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  select jsonb_build_object(
    'university',jsonb_build_object('id',u.id,'name',u.name,'slug',u.slug,'website',u.website,'country_code',u.country_code,'logo_url',u.logo_url,'updated_at',u.updated_at),
    'categories', jsonb_build_array(
      jsonb_build_object('key','identity','label','Official identity','count',case when u.website is not null and u.reference_url is not null then 1 else 0 end),
      jsonb_build_object('key','programs','label','Program offerings','count',(select count(*) from public.university_programs r where r.university_id=u.id and r.verification_status='verified')),
      jsonb_build_object('key','requirements','label','Entry requirements','count',(select count(*) from public.requirements r where r.university_id=u.id and r.verification_status='verified')),
      jsonb_build_object('key','deadlines','label','Application dates','count',(select count(*) from public.deadlines r where r.university_id=u.id and r.verification_status='verified')),
      jsonb_build_object('key','costs','label','Costs','count',(select count(*) from public.costs r where r.university_id=u.id and r.verification_status='verified')),
      jsonb_build_object('key','admissions','label','Admission observations','count',(select count(*) from public.admissions r where r.university_id=u.id and r.verification_status='verified')),
      jsonb_build_object('key','rankings','label','Ranking observations','count',(select count(*) from public.ranking_entries r where r.university_id=u.id and r.verification_status='verified')),
      jsonb_build_object('key','media','label','Reusable campus photos','count',(select count(*) from public.media r where r.university_id=u.id and r.verification_status='verified' and r.reuse_permitted and r.kind='campus'))
    ),
    'requirement_evidence',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'label',r.label,'kind',r.kind,'minimum',r.minimum,'maximum',r.maximum,'student_category',r.student_category,'required',r.required,'year',r.year,'source_url',r.source_url,'verified_at',r.verified_at,'notes',r.notes) order by r.label) from public.requirements r where r.university_id=u.id and r.verification_status='verified'),'[]'::jsonb),
    'pending',(select count(*) from public.source_records r where r.university_id=u.id and r.status='pending'),
    'conflicts',(select count(*) from public.source_records r where r.university_id=u.id and r.status='conflicting'),
    'last_requirement_check',(select max(r.verified_at) from public.requirements r where r.university_id=u.id and r.verification_status='verified'),
    'oldest_requirement_check',(select min(r.verified_at) from public.requirements r where r.university_id=u.id and r.verification_status='verified')
  ) into result from public.universities u where u.id=target;
  if result is null then raise exception 'University not found' using errcode='P0002'; end if;
  return result;
end $$;
revoke all on function public.admin_university_coverage(uuid) from public, anon;
grant execute on function public.admin_university_coverage(uuid) to authenticated;

-- Stage events use the existing source_records audit_changes trigger and initiating user.
comment on function public.admin_university_coverage(uuid) is 'Staff-only counts of verified structured evidence, not a claim of full profile completeness.';
