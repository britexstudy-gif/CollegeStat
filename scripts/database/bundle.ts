/** Generate reviewable SQL for an empty Supabase project. Never connects or executes. */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { globalCatalogue } from '../../server/global-catalogue';
import { currentScholarships } from '../../server/scholarship-catalogue';
import applicationDates from '../../data/published/application-dates-current.json';
import requirements from '../../data/published/requirements-current.json';
import { awardImportSQL } from './award-import';
const out = 'data/exports';
await mkdir(out, { recursive: true });
const files = (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort();
const seeds = ['seed.sql', 'seed-evidence.sql', 'seed-intelligence.sql', 'seed-assets.sql'];
const sql = ['-- Empty projects only. Transaction rolls back on any error.', 'begin;'];
for (const file of [...files.map(f => 'migrations/' + f), ...seeds]) {
  sql.push('-- Source: supabase/' + file, await readFile('supabase/' + file, 'utf8'));
}
sql.push('commit;');
await writeFile(out + '/01-schema.sql', sql.join('\n'));
const columns = ['id','slug','name','short_name','country_code','city','region','website','description','published','reference_url','reference_retrieved_at'];
const literal = (v: unknown) => v == null ? 'null' : typeof v === 'boolean' ? String(v) : "'" + String(v).replaceAll("'", "''") + "'";
const identities = ['-- Published directory identities only; preserves existing rows and user data.', 'begin;'];
for (let i=0; i<globalCatalogue.length; i+=100) {
  const values = globalCatalogue.slice(i,i+100).map(u => '(' + columns.map(c => literal(c === 'published' ? true : u[c as keyof typeof u])).join(',') + ')');
  identities.push(`insert into public.universities (${columns.join(',')}) values\n${values.join(',\n')}\non conflict do nothing;`);
}
identities.push('commit;');
await writeFile(out + '/02-directory-identities.sql', identities.join('\n'));
const evidence = awardImportSQL();
await writeFile(out + '/03-awards-and-dates.sql', evidence);
console.log(`Generated ${files.length} migrations, ${globalCatalogue.length} identities, ${currentScholarships.length} linked awards, ${applicationDates.length} scoped dates and ${requirements.length} entry requirements in ${out}. No remote writes.`);
