import { cache } from 'react';
import { createClient } from '@supabase/supabase-js';
import { publicConfig } from './public-config';
import { normalizeUniversity, type University, type Scholarship } from '@/lib/domain';
import { readFilters, type Filters, parseResearchQuery } from '@/lib/research';
import { universitySelect, type Catalogue, type ExplorerResult } from '@/lib/supabase/catalogue';
import { discoveryPreview } from './explorer';

export function publicDatabase() {
  const config = publicConfig();
  if (!config.url || !config.anon) throw new Error('Public catalogue is not connected.');
  return createClient(config.url, config.anon, {auth:{persistSession:false,autoRefreshToken:false}});
}
export async function hostedUniversities(ids: string[]) {
  if (!ids.length) return [];
  const selected = [...new Set(ids)].slice(0,24);
  const {data,error} = await publicDatabase().from('universities').select(universitySelect).eq('published',true).in('id',selected);
  if (error) throw new Error('University details could not be loaded.');
  const rows = (data as unknown as University[]).map(normalizeUniversity);
  return selected.flatMap(id => rows.filter(u => u.id === id));
}
export async function hostedExplore(filters: Filters): Promise<ExplorerResult> {
  const {data,error} = await publicDatabase().rpc('explore_universities',{filters,page_number:filters.page});
  if (error) throw new Error('Search could not be loaded.');
  const page = Math.min(filters.page,Math.max(1,Math.ceil(data.total/24)));
  if (page !== filters.page) return hostedExplore({...filters,page});
  const universities = (await hostedUniversities(data.ids)).map(discoveryPreview);
  return {universities,total:data.total,page,medianTuition:data.medianTuition,medianAdmission:data.medianAdmission,countries:data.countries};
}
export async function hostedSearch(query: string) {
  const parsed = parseResearchQuery(query.slice(0,200));
  if (parsed.recognized) return (await hostedExplore(parsed.filters)).universities.slice(0,8);
  const {data,error} = await publicDatabase().rpc('search_universities',{search_term:query.slice(0,200),result_limit:8});
  if (error) throw new Error('Search could not be loaded.');
  return (await hostedUniversities(data.map((u:{id:string}) => u.id))).map(discoveryPreview);
}
export const hostedCatalogue = cache(async (): Promise<Catalogue & {total:number;countries:number}> => {
  const db = publicDatabase();
  const [featured,scholarships] = await Promise.all([
    db.rpc('explore_universities',{filters:readFilters(new URLSearchParams()),page_number:1}),
    db.from('scholarships').select('*,data_sources(*),university_scholarships(university_id,universities(id,name,slug))').eq('published',true).eq('verification_status','verified').order('deadline',{nullsFirst:false}).limit(24),
  ]);
  if (featured.error || scholarships.error) throw new Error('The catalogue could not be loaded.');
  return {mode:'supabase',universities:await hostedUniversities(featured.data.ids.slice(0,12)),scholarships:scholarships.data as unknown as Scholarship[],total:featured.data.total,countries:featured.data.countries};
});
export async function hostedRankingProfiles() {
  const rows: University[] = [];
  for(let offset=0;offset<10000;offset+=1000) {
    const {data,error} = await publicDatabase().rpc('ranking_profiles',{result_offset:offset,result_limit:1000});
    if(error) throw new Error('Ranking profiles could not be loaded.');
    const page = data as unknown as (University & {rankings?:unknown[]})[];
    rows.push(...page.filter(u => u.rankings?.length || u.ranking_entries.length || u.imported_records?.some(r => r.source==='leiden')).map(normalizeUniversity));
    if(data.length<1000) break;
  }
  return rows;
}
