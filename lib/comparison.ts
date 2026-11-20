import identityRedirects from "@/data/published/identity-redirects.json";

const uuid = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
export const COMPARISON_GROUPS = [
  "All",
  "Overview",
  "Admissions",
  "Costs",
  "Financial aid",
  "Academics",
  "Students",
  "Outcomes",
  "Rankings",
  "Programs & research",
] as const;
export const comparisonSectionKey = (group: string) =>
  group.toLowerCase().replaceAll(" & ", "-").replaceAll(" ", "-");
export function comparisonSection(value: string | null): string {
  const key = value?.toLowerCase().trim();
  return (
    ["Essentials", ...COMPARISON_GROUPS].find(
      (group) =>
        comparisonSectionKey(group) === key || group.toLowerCase() === key,
    ) || "Essentials"
  );
}
export function canonicalComparisonIDs(ids: readonly string[]) {
  const canonical = ids
    .map((id) => id.toLowerCase())
    .filter((id) => uuid.test(id))
    .map(
      (id) =>
        (identityRedirects as Record<string, { id: string }>)[id]?.id || id,
    );
  return [...new Set(canonical)].slice(0, 5);
}
export function moveComparisonID(
  ids: readonly string[],
  id: string,
  offset: -1 | 1,
) {
  const next = [...ids],
    index = next.indexOf(id),
    target = index + offset;
  if (index < 0 || target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
/** Keys include year/currency/population, so equal numbers with different
 * contexts remain visible when comparing differences. Null means unavailable. */
export function comparisonRowVisible(
  keys: readonly (string | null)[],
  options: {
    onlyDifferences: boolean;
    hideEmpty: boolean;
  },
) {
  if (options.hideEmpty && keys.every((key) => key == null)) return false;
  return !options.onlyDifferences || new Set(keys).size > 1;
}
export function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safe = /^\s*[=+@-]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}
