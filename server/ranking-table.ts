import { globalCatalogue } from "./global-catalogue";
import { rankingTableFor } from "./ranking-rows";
export type { RankingTable } from "./ranking-rows";
export function rankingTable(p: URLSearchParams) {
  return rankingTableFor(p, globalCatalogue);
}
