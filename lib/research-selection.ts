import type { University } from "./domain";
import { defaultFilters, filterUniversities, type Filters } from "./research";
import { normalizeSearch } from "./search-text";

/** Remove a question wrapper, never the institution name or actual filters. */
export function researchNameQuery(question: string): string {
  const named = question
    .trim()
    .match(
      /^(?:what|how much)\s+(?:does|do)\s+(.+?)\s+(?:report|say|charge|offer|require)\b/i,
    );
  return (named?.[1] || question).trim().slice(0, 200);
}

/** Deterministic, bounded public retrieval for research without a model call. */
export function selectLocalResearch(
  catalogue: University[],
  input: { question: string; ids: string[] },
  interpretation: { recognized: boolean; filters: Filters },
) {
  let matches: University[];
  if (input.ids.length) {
    matches = catalogue.filter((u) => input.ids.includes(u.id));
  } else if (interpretation.recognized) {
    // Every supported constraint must survive; do not broaden an empty result.
    matches = filterUniversities(catalogue, interpretation.filters);
  } else {
    const question = " " + normalizeSearch(input.question) + " ";
    const named = catalogue.filter((u) =>
      [u.name, u.short_name, u.slug, ...(u.aliases || [])].some(
        (name) =>
          name &&
          normalizeSearch(name).length > 1 &&
          question.includes(" " + normalizeSearch(name) + " "),
      ),
    );
    matches = named.length
      ? named
      : filterUniversities(catalogue, { ...defaultFilters, q: input.question });
  }
  return { total: matches.length, rows: matches.slice(0, 24) };
}
