import { spellingSuggestions } from '@/lib/search-text';
import { globalCatalogue } from './global-catalogue';
import { discoveryPreview } from './discovery-preview';
import { filterUniversities, median, readFilters, valueOf } from '@/lib/research';
import type { ExplorerResult } from '@/lib/supabase/catalogue';
export { discoveryPreview };

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
