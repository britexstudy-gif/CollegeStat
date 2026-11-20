import { spellingSuggestions } from "@/lib/search-text";
import type { University as CatalogueRow } from "@/lib/domain";
import { catalogueList } from "./catalogue-store";
import { cardPreview } from "./discovery-preview";
import { withTuition } from "./tuition-index";
import {
  filterUniversities,
  median,
  readFilters,
  valueOf,
} from "@/lib/research";
import type { ExplorerResult } from "@/lib/supabase/catalogue";

// List-weight rows precomputed by scripts/build-catalogue.ts, loaded on first use.
let rows: Promise<CatalogueRow[]> | undefined;
const globalCatalogue = () => (rows ??= catalogueList().then((list) => list.map(withTuition)));

export { discoveryPreview } from "./discovery-preview";
export async function exploreCatalogue(params: URLSearchParams): Promise<ExplorerResult> {
  const filters = readFilters(params);
  const catalogue = await globalCatalogue();
  const all = filterUniversities(catalogue, filters);
  const page = Math.min(filters.page, Math.max(1, Math.ceil(all.length / 24)));
  return {
    suggestions:
      all.length || !filters.q
        ? []
        : spellingSuggestions(
            filters.q,
            filterUniversities(catalogue, { ...filters, q: "" }),
          ).map((u) => ({ name: u.name, slug: u.slug })),
    universities: all.slice((page - 1) * 24, page * 24).map(cardPreview),
    page,
    total: all.length,
    medianTuition: median(
      all.map((u) => {
        const v = valueOf(u, "tuition");
        return v.currency === "USD" ? v.value : null;
      }),
    ),
    medianAdmission: median(all.map((u) => valueOf(u, "admission").value)),
    countries: new Set(all.map((u) => u.country_code)).size,
  };
}
