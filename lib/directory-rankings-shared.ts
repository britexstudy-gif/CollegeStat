export type DirectoryRankingProvider = "webometrics" | "unirank" | "cwur" | "urap";

const regionNames = new Intl.DisplayNames(["en"], {
  type: "region",
  fallback: "none",
});
/** Publisher grouping codes are never silently converted to a guessed country. */
export function directoryRankingCountryName(code: string) {
  if (code === "TY") return "Publisher region (TY)";
  if (code === "EU") return "European Union (publisher region)";
  try {
    return regionNames.of(code) || `Publisher region (${code})`;
  } catch {
    return `Publisher region (${code})`;
  }
}

export const directoryWorldRankLabel = (row: {
  world_rank: number | null;
  world_tied?: boolean;
}) =>
  row.world_rank === null
    ? "—"
    : `${row.world_tied ? "=" : "#"}${row.world_rank.toLocaleString("en-US")}`;
