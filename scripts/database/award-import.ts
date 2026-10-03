import { globalCatalogue } from '../../server/global-catalogue';
import { currentScholarships } from '../../server/scholarship-catalogue';
import applicationDates from '../../data/published/application-dates-current.json';
import requirements from '../../data/published/requirements-current.json';
const literal = (v: unknown) => v == null ? 'null' : typeof v === 'boolean' ? String(v) : "'" + String(v).replaceAll("'", "''") + "'";
export function awardImportSQL() {
const evidence = ['-- Reviewed October 2026 awards, application dates and entry requirements. Run after 01 and 02.', '-- Existing records are preserved; updates require administrator review.', 'begin;'];
function insert(table: string, row: Record<string, unknown>) {
  const keys = Object.keys(row);
  evidence.push(`insert into public.${table} (${keys.join(',')}) values (${keys.map(k => literal(row[k])).join(',')}) on conflict do nothing;`);
}
for (const award of currentScholarships) {
  insert('data_sources', { ...award.data_sources!, source_type:'scholarship', trust_level:'high' });
  const university_scholarships = award.university_scholarships;
  const record = Object.fromEntries(Object.entries(award).filter(([key]) => !['university_scholarships','data_sources','source_url'].includes(key))); 
  insert('scholarships', record);
  for (const link of university_scholarships) insert('university_scholarships', { university_id:link.university_id, scholarship_id:award.id });
}
for (const deadline of applicationDates) {
  insert('data_sources', { id:deadline.source_id, name:deadline.title + ' · official dates', organization:globalCatalogue.find(u => u.id === deadline.university_id)?.name, url:deadline.source_url, source_type:'official', retrieved_at:deadline.verified_at, trust_level:'high' });
  insert('deadlines', { ...deadline, due_at:deadline.due_at.length === 10 ? null : deadline.due_at, due_date:deadline.due_at.length === 10 ? deadline.due_at : null });
}
for (const requirement of requirements) {
  insert('data_sources', { ...requirement.data_sources, trust_level:'high' });
  const record = Object.fromEntries(Object.entries(requirement).filter(([key]) => key !== 'data_sources'));
  insert('requirements', record);
}
evidence.push('commit;');
return evidence.join('\n');
}
