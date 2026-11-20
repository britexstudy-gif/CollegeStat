// Precomputes the two small ranking inputs the Worker reads instead of 50 MB of
// catalogue and 1.7 MB of publisher tables (see server/ranking-table.ts and
// server/rankings-view.ts). Runs after the catalogue (npm run catalogue).
import { readFileSync, writeFileSync } from "node:fs";
import { directoryRankingRows } from "../lib/directory-rankings";

const root = new URL("../", import.meta.url).pathname;
const readData = (name: string) => JSON.parse(readFileSync(root + "data/" + name, "utf8"));

// The catalogue rows the world and regional tables join to: every university in
// a world table, plus the ones a regional table matches by website domain.
const list: Record<string, unknown>[] = readData("generated/catalogue/list.json");
const worldIds = new Set((readData("published/ranking-all.json") as { university_id?: string | null }[]).flatMap((r) => (r.university_id ? [r.university_id] : [])));
const domains = (readData("published/regional-rankings.json") as { domain: string }[]).map((r) => r.domain);
const hostOf = (site: unknown) => {
  try {
    return new URL(String(site || "")).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};
const FIELDS = ["id", "name", "slug", "short_name", "aliases", "website", "country_code", "logo_url", "institution_image_url", "website_icon_url", "rankings", "ranking_entries", "identifiers"];
const joined = list
  .filter((u) => {
    const host = hostOf(u.website) === "nus.edu" ? "nus.edu.sg" : hostOf(u.website); // as server/ranking-table.ts joins it
    return worldIds.has(String(u.id)) || domains.some((d) => host === d || host.endsWith("." + d));
  })
  .map((u) => Object.fromEntries(FIELDS.filter((k) => u[k] !== undefined).map((k) => [k, u[k]])));
writeFileSync(root + "data/generated/ranking-profiles.json", JSON.stringify(joined));

const directory = Object.fromEntries((["webometrics", "unirank", "cwur"] as const).map((provider) => [provider, directoryRankingRows(provider)]));
writeFileSync(root + "data/generated/directory-ranking-rows.json", JSON.stringify(directory));
