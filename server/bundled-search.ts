import { filterUniversities, type Filters } from "@/lib/research";
import { searchRelevance } from "@/lib/search-text";
import type { University } from "@/lib/domain";
import { cardPreview } from "./discovery-preview";

/** Rank filter matches by name relevance and keep the top eight. Pure so the
 * ordering can be tested without loading the catalogue. */
export function topFilterMatches(rows: readonly University[], filters: Filters): University[] {
  return filterUniversities([...rows], filters)
    .sort(
      (a, b) =>
        searchRelevance(filters.q, b.name, b.aliases) -
        searchRelevance(filters.q, a.name, a.aliases),
    )
    .slice(0, 8);
}

/** Top matches for a parsed natural-language query, from the bundled catalogue.
 * Shared by the bundled API path and the hosted search fallback so both apply
 * the filters (including publisher subject lists) identically. Rows are card
 * previews, the same shape hosted search returns (search lists only render
 * name, place and logo). */
export async function bundledFilterSearch(filters: Filters) {
  const { catalogueList } = await import("./catalogue-store");
  return topFilterMatches(await catalogueList(), filters).map(cardPreview);
}
