import { spellingSuggestions } from '@/lib/search-text';
import { globalCatalogue } from './global-catalogue';
import type { University } from '@/lib/domain';
import { filterUniversities, median, readFilters, valueOf } from '@/lib/research';
import type { ExplorerResult } from '@/lib/supabase/catalogue';

/** Cards keep their evidence, but course and paper libraries load on the profile route. */
export function discoveryPreview(u: University): University {
  const cardMetrics = new Set(['acceptance_rate','enrollment_12_month','tuition_in_state','tuition_out_of_state','fees_out_of_state']);
  return { ...u, profile_resources: undefined, reported_programs: [], university_programs: [], departments: [], professors: [], research: [], requirements: [],
    application_brief: undefined, research_identity: undefined,
    imported_records: u.imported_records?.filter(r => cardMetrics.has(r.metric)),
  };
}
export function exploreCatalogue(params: URLSearchParams): ExplorerResult {
  const filters = readFilters(params);
  const all = filterUniversities(globalCatalogue, filters);
  const page = Math.min(filters.page, Math.max(1, Math.ceil(all.length / 24)));
  return {
    suggestions: all.length || !filters.q ? [] : spellingSuggestions(filters.q, filterUniversities(globalCatalogue, {...filters,q:""})).map(u => ({name:u.name,slug:u.slug})),
    universities: all.slice((page-1)*24, page*24).map(discoveryPreview),
    page, total: all.length,
    medianTuition: median(all.map(u => { const v=valueOf(u,'tuition'); return v.currency==='USD' ? v.value : null; })),
    medianAdmission: median(all.map(u => valueOf(u,'admission').value)),
    countries: new Set(all.map(u => u.country_code)).size,
  };
}
