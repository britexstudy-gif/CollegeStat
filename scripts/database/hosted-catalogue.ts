/** Import reviewed evidence through an administrator's JWT; no service key is needed.
 * --check builds and validates locally. --apply preserves existing rows by default.
 * Credentials live only in the ignored outputs/review-account.json file.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { verifyStaffMFA } from './staff-mfa';
import columnsJSON from './catalogue-columns.json';
import { globalCatalogue } from '../../server/global-catalogue';
import { referenceScholarships } from '../../server/catalogue';
import { valueOf } from '../../lib/research';
import { universityRanks } from '../../lib/ranking-highlights';
import { languageMinimum } from '../../lib/domain';

type Row = Record<string, unknown>;
const columns = columnsJSON as Record<string, string[]>;
const tables = new Map<string, Map<string, Row>>();
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
function id(table: string, value: unknown) {
  if (typeof value === 'string' && uuid.test(value)) return value;
  const hex = createHash('sha256').update('collegestat:' + table + ':' + String(value)).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
function add(table: string, input: Row, identity: unknown = input.id) {
  const row: Row = Object.fromEntries(columns[table].filter(k => input[k] !== undefined && !['created_at','updated_at'].includes(k)).map(k => [k,input[k]]));
  row.id = id(table, identity);
  // Older government releases do not report an evidence confidence label.
  // Keep that uncertainty explicit rather than writing a null into a required field.
  if (columns[table].includes('confidence') && row.confidence == null) row.confidence = 'low';
  let records = tables.get(table);
  if (!records) { records = new Map(); tables.set(table, records); }
  const previous = records.get(String(row.id));
  if (previous && JSON.stringify(previous) !== JSON.stringify(row)) throw new Error(`Conflicting ${table} identity ${row.id}`);
  records.set(String(row.id), row);
  return row.id as string;
}
function source(raw: Row | null | undefined, record: Row, universityName: string) {
  const url = String(raw?.url || record.source_url || '');
  if (!url.startsWith('https://')) throw new Error(`Missing traceable source: ${universityName}`);
  const key = raw?.id || record.source_id || url;
  const sourceId = typeof key === 'string' && uuid.test(key) ? key : id('data_sources', key + ':' + url);
  const kind = ['official','government','accreditation','ranking','secondary','scholarship'].includes(String(raw?.source_type)) ? raw?.source_type : url.includes('commons.wikimedia.org') ? 'secondary' : 'official';
  add('data_sources', { ...raw, id:sourceId, name:raw?.name || universityName + ' · official source', url, source_type:kind, trust_level:kind === 'secondary' ? 'medium' : 'high', retrieved_at:raw?.retrieved_at || record.verified_at, license_notes:raw?.license_notes || record.license || 'Attributed evidence; consult the source for reuse conditions.' });
  return sourceId;
}
const resourceKeys = ['reported_programs','research_identity','publisher_students','official_web','application_brief','admission_summary','social_links','contact_email','contact_source_url','social_source_url','institution_image_url'] as const;
const children = ['data_points','costs','admissions','campuses','departments','professors','research','deadlines','requirements','financial_aid','media'] as const;
const metricKeys = {admission:'admission',tuition:'tuition',international:'international_students',graduation:'graduation_rate',aid:'aid_recipients'} as const;
for (const u of globalCatalogue) {
  const discovery = Object.fromEntries(Object.entries(metricKeys).map(([k,metric]) => {
    const fact = valueOf(u, metric);
    return [k, fact.value != null && (k !== 'tuition' || fact.currency === 'USD') ? fact.value : null];
  }));
  discovery.ielts = languageMinimum(u, 'IELTS');
  const profile_resources = {
    ...Object.fromEntries(resourceKeys.map(k => [k,u[k] ?? null])),
    discovery,
    rankings:universityRanks(u),
    country_name:new Intl.DisplayNames(['en'],{type:'region'}).of(u.country_code),
  };
  add('universities', {...u,published:true,profile_resources});
  for (const alias of [...new Set([u.short_name,...(u.aliases || [])].filter((a): a is string => !!a))]) add('university_aliases', {university_id:u.id,alias}, u.id + ':' + alias);
  for (const [i, link] of u.university_programs.entries()) {
    const programId = add('programs', link.programs as unknown as Row);
    const record = {...link,university_id:u.id,program_id:programId};
    const sourceId = source(link.data_sources as unknown as Row,record,u.name);
    add('university_programs', {...record,source_id:sourceId}, u.id + ':' + programId + ':' + i);
  }
  for (const table of children) for (const [i, entry] of (u[table] as unknown as Row[]).entries()) {
    const row: Row = {...entry,university_id:u.id};
    if (row.source_id || row.source_url || row.data_sources) row.source_id = source(row.data_sources as Row,row,u.name);
    if (row.program_id) row.program_id = id('programs',row.program_id);
    if (row.department_id) row.department_id = id('departments',row.department_id);
    if (row.professor_id) row.professor_id = id('professors',row.professor_id);
    if (table === 'media' && typeof row.license_url === 'string') row.license_url = row.license_url.replace(/^http:\/\/creativecommons\.org\//,'https://creativecommons.org/');
    if (table === 'deadlines' && typeof row.due_at === 'string' && row.due_at.length === 10) { row.due_date = row.due_at; row.due_at = null; }
    add(table,row,entry.id || u.id + ':' + i);
  }
}
const scholarships = new Map(referenceScholarships.map(s => [s.id,s]));
for (const u of globalCatalogue) for (const link of u.university_scholarships) if (link.scholarships) scholarships.set(link.scholarships.id,link.scholarships);
for (const award of scholarships.values()) {
  const sourceId = source(award.data_sources as unknown as Row,award as unknown as Row,award.name);
  add('scholarships',{...award,source_id:sourceId});
  const links = new Set(award.university_scholarships?.map(l => l.university_id) || []);
  for (const u of globalCatalogue) if (u.university_scholarships.some(l => l.scholarships?.id === award.id)) links.add(u.id);
  for (const university_id of links) add('university_scholarships',{university_id,scholarship_id:award.id},university_id + ':' + award.id);
}
// Validate references before any remote write.
const references = {university_id:'universities',program_id:'programs',source_id:'data_sources',department_id:'departments',professor_id:'professors',scholarship_id:'scholarships'};
for (const [table, rows] of tables) for (const row of rows.values()) for (const [key,target] of Object.entries(references)) if (row[key] && !tables.get(target)?.has(String(row[key]))) throw new Error(`Unresolved ${table}.${key}: ${row[key]}`);
const counts = Object.fromEntries([...tables].map(([t,rows]) => [t,rows.size]));
await mkdir('outputs',{recursive:true});
await writeFile('outputs/catalogue-import-plan.json',JSON.stringify({createdAt:new Date().toISOString(),counts},null,2)+'\n');
console.log(JSON.stringify({plan:counts,mode:process.argv.includes('--apply') ? 'apply' : 'check'}));
if (!process.argv.includes('--apply')) process.exit(0);
process.loadEnvFile('.env.local');
const credentials = JSON.parse(await readFile('outputs/review-account.json','utf8'));
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false,autoRefreshToken:true}});
const auth = await db.auth.signInWithPassword({email:credentials.email,password:credentials.password});
if (auth.error || auth.data.user?.id !== credentials.userId) throw new Error('Review administrator authentication failed.');
const profile = await db.from('profiles').select('role').eq('id',credentials.userId).single();
if (profile.error || profile.data.role !== 'admin') throw new Error('A database-assigned administrator role is required.');
await verifyStaffMFA(db);
const order = ['data_sources','universities','programs','university_aliases','university_programs',...children,'scholarships','university_scholarships'];
const from = process.argv.find(a => a.startsWith('--from='))?.slice(7);
if (from && !order.includes(from)) throw new Error('Unknown resume table.');
for (const table of from ? order.slice(order.indexOf(from)) : order) {
  const rows = [...(tables.get(table)?.values() || [])];
  for (let offset=0;offset<rows.length;offset+=80) {
    const batch = rows.slice(offset,offset+80);
    const result = await db.from(table).upsert(batch,{onConflict:'id',ignoreDuplicates:true});
    if (result.error) throw new Error(`${table} batch ${offset}: ${result.error.code} ${result.error.message}`);
    if (offset % 800 === 0 || offset+80 >= rows.length) console.log(`${table}: ${Math.min(offset+80,rows.length)}/${rows.length}`);
  }
}
const ids = globalCatalogue.filter(u => ['stanford','mit','oxford'].includes(u.slug)).map(u => u.id);
const accountSeeds = await Promise.all([
  db.from('saved_universities').upsert(ids.map(university_id => ({user_id:credentials.userId,university_id,status:'Researching'})),{onConflict:'user_id,university_id',ignoreDuplicates:true}),
  db.from('comparison_lists').select('id').eq('user_id',credentials.userId).limit(1),
  db.from('user_checklist').select('id').eq('user_id',credentials.userId).limit(1),
]);
if (accountSeeds.some(r => r.error)) throw new Error('Review workspace setup failed.');
if (!accountSeeds[1].data?.length) { const r = await db.from('comparison_lists').insert({user_id:credentials.userId,name:'My comparison',university_ids:ids}); if(r.error) throw new Error('Comparison setup failed.'); }
if (!accountSeeds[2].data?.length) { const r = await db.from('user_checklist').insert(['Review program requirements','Compare costs for your student category','Confirm official application dates'].map(title => ({user_id:credentials.userId,title,done:false}))); if(r.error) throw new Error('Checklist setup failed.'); }
await db.auth.signOut();
await writeFile('outputs/catalogue-import-result.json',JSON.stringify({completedAt:new Date().toISOString(),counts,reviewUserId:credentials.userId},null,2)+'\n');
console.log('Catalogue import completed. Existing rows and user work were preserved.');
