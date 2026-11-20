// Draft target list for the launch segment: Central Asian (UZ, KZ, KG, TJ)
// students applying abroad for a bachelor's degree, intake 2027.
//
//   node --import tsx scripts/segment/select-targets.ts
//
// Reads only the bundled catalogue (data/generated/catalogue/list.json, built by
// scripts/build-catalogue.ts) and writes data/segment/targets.json. Nothing is
// fetched and no catalogue data is changed. Re-running gives the same list as
// long as the catalogue and the quotas below are unchanged.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { RankHighlight } from "@/lib/ranking-highlights";

type Row = { id: string; slug: string; name: string; country_code: string; rankings?: RankHighlight[] };
export type Target = { id: string; slug: string; name: string; country_code: string; reason: string };

/** Destinations in the order the owner brief lists them, with how many
 * universities each gets. The order doubles as "most-applied-to" priority in
 * the coverage report. Quotas are a judgement call for owner review. */
export const DESTINATION_QUOTAS: [string, number][] = [
  ["US", 28], ["GB", 18], ["DE", 14], ["KR", 14], ["TR", 14], ["MY", 10],
  ["CN", 12], ["JP", 10], ["IT", 10], ["HU", 8], ["PL", 8], ["CZ", 6],
  ["CA", 10], ["RU", 10], ["AE", 6], ["SG", 4], ["HK", 6],
];

/** International, foreign-partner or English-medium institutions inside the four
 * home countries, matched by exact catalogue name + country. Named explicitly
 * because "international branch campus" is not a field in our data. */
export const HOME_CAMPUSES: [string, string, string][] = [
  ["UZ", "Westminster International University in Tashkent", "UK (University of Westminster) partner university in Tashkent; named in owner brief"],
  ["UZ", "Inha University in Tashkent", "Korean (Inha University) branch in Tashkent; named in owner brief"],
  ["UZ", "Turin Polytechnic University In Tashkent", "Italian (Politecnico di Torino) partner university in Tashkent"],
  ["UZ", "Ajou University in Tashkent", "Korean (Ajou University) branch in Tashkent"],
  ["UZ", "British Management University in Tashkent", "UK-affiliated private university in Tashkent"],
  ["UZ", "Russian Economic University after G.V. Plekhanov", "Russian (Plekhanov) branch in Tashkent"],
  ["KZ", "Nazarbayev University", "English-medium national research university in Astana; named in owner brief"],
  ["KZ", "Kazakhstan Institute of Management, Economics, and Strategic Research", "KIMEP, English-medium university in Almaty"],
  ["KZ", "Kazakh British Technical University", "British-model technical university in Almaty"],
  ["KZ", "Kazakh German University", "German-partner university in Almaty"],
  ["KG", "American University of Central Asia", "US liberal-arts model university in Bishkek"],
  ["KG", "University of Central Asia", "Tri-national (KZ/KG/TJ) English-medium university"],
  ["KG", "Kyrgyz-Türkish Manas Üniversity", "Turkish-Kyrgyz intergovernmental university in Bishkek"],
  ["KG", "Kyrgyz Russian Slavic University", "Russian-Kyrgyz intergovernmental university in Bishkek"],
  ["TJ", "Moscow State University", "Lomonosov Moscow State University branch in Dushanbe"],
  ["TJ", "Russian-Tajik Slavonic University", "Russian-Tajik intergovernmental university in Dushanbe"],
];

/** World publishers used for banding; national tables are excluded so ranks compare. */
const WORLD = new Set(["qs", "the", "arwu"]);

/** Latest installed edition year per world publisher across the whole catalogue,
 * so a university missing from the newest table is not ranked by an older one. */
export function latestEditions(list: Row[]): Map<string, number> {
  const latest = new Map<string, number>();
  for (const u of list) for (const r of u.rankings ?? []) if (WORLD.has(r.provider)) latest.set(r.provider, Math.max(latest.get(r.provider) ?? 0, r.year));
  return latest;
}

/** Best world position across the latest edition of each world publisher.
 * Banded entries carry their band's lower bound in `rank`, which is what we use. */
export function bestWorldRank(rows: RankHighlight[] = [], latest: Map<string, number>): { rank: number; label: string } | null {
  let best: { rank: number; label: string } | null = null;
  for (const r of rows) {
    if (!WORLD.has(r.provider) || r.year !== latest.get(r.provider) || r.rank == null) continue;
    if (!best || r.rank < best.rank) best = { rank: r.rank, label: `${r.provider.toUpperCase()} ${r.year} ${r.rank_label}` };
  }
  return best;
}

/** Half the quota from the top of the country's ranked list, the other half
 * spread evenly over the rest, so mid- and lower-band (often cheaper,
 * scholarship-heavier) options are represented, not only the top 50. */
export function stratifiedPick<T>(sorted: T[], quota: number): { item: T; band: "top" | "spread" }[] {
  if (sorted.length <= quota) return sorted.map((item) => ({ item, band: "top" as const }));
  const topCount = Math.ceil(quota / 2);
  const rest = sorted.slice(topCount);
  const spread = quota - topCount;
  const picks: { item: T; band: "top" | "spread" }[] = sorted.slice(0, topCount).map((item) => ({ item, band: "top" }));
  for (let i = 0; i < spread; i++) picks.push({ item: rest[Math.floor(((i + 0.5) * rest.length) / spread)], band: "spread" });
  return picks;
}

export function selectTargets(list: Row[]): { targets: Target[]; shortfalls: string[] } {
  const targets: Target[] = [];
  const shortfalls: string[] = [];
  const latest = latestEditions(list);
  for (const [cc, quota] of DESTINATION_QUOTAS) {
    const ranked = list
      .filter((u) => u.country_code === cc)
      .flatMap((u) => {
        const best = bestWorldRank(u.rankings, latest);
        return best ? [{ u, best }] : [];
      })
      .sort((a, b) => a.best.rank - b.best.rank || a.u.name.localeCompare(b.u.name));
    if (ranked.length < quota) shortfalls.push(`${cc}: ${ranked.length} ranked of quota ${quota}`);
    for (const { item, band } of stratifiedPick(ranked, quota))
      targets.push({
        id: item.u.id,
        slug: item.u.slug,
        name: item.u.name,
        country_code: cc,
        reason: `Destination ${cc}; best world rank ${item.best.label} (#${item.best.rank} by band floor); ${band === "top" ? "top half of country quota" : "evenly spread lower band of country quota"}`,
      });
  }
  for (const [cc, name, why] of HOME_CAMPUSES) {
    const u = list.find((r) => r.country_code === cc && r.name === name);
    if (!u) {
      shortfalls.push(`${cc}: home campus not in catalogue: ${name}`);
      continue;
    }
    targets.push({ id: u.id, slug: u.slug, name: u.name, country_code: cc, reason: `Home-country option: ${why}` });
  }
  return { targets, shortfalls };
}

export const SELECTION_RULE =
  "Bundled catalogue only (data/generated/catalogue/list.json). (1) For each destination in DESTINATION_QUOTAS " +
  "(US 28, GB 18, DE 14, KR 14, TR 14, MY 10, CN 12, JP 10, IT 10, HU 8, PL 8, CZ 6, CA 10, RU 10, AE 6, SG 4, HK 6), take universities " +
  "in that country that have a position in the latest installed QS (2027), THE (2026) or ARWU (2026) world edition; best rank = lowest position " +
  "(band floor for banded entries) across those three. Sort by best rank, then name. Take the top ceil(quota/2), then " +
  "floor(quota/2) more evenly spaced over the remaining ranked list (index floor((i+0.5)*rest/spread)), so lower, cheaper bands " +
  "are included. Unranked universities are never picked for destinations. (2) Add 16 named international/foreign-partner/English-medium " +
  "institutions inside UZ, KZ, KG, TJ (HOME_CAMPUSES, exact name + country). Ranking is a proxy for where this segment applies; " +
  "we have no application-volume data, and English-taught or scholarship status is not a usable field yet, so the owner should " +
  "swap in known favourites. Generated by scripts/segment/select-targets.ts.";

if (import.meta.url === `file://${process.argv[1]}`) {
  const list = JSON.parse(readFileSync(new URL("../../data/generated/catalogue/list.json", import.meta.url), "utf8")) as Row[];
  const { targets, shortfalls } = selectTargets(list);
  const out = new URL("../../data/segment/", import.meta.url);
  mkdirSync(out, { recursive: true });
  const doc = {
    status: "DRAFT — for owner review",
    segment: "Students from Uzbekistan, Kazakhstan, Kyrgyzstan and Tajikistan applying for bachelor's degrees abroad (and at international campuses at home), intake 2027",
    selection_rule: SELECTION_RULE,
    generated_from: "data/generated/catalogue/list.json",
    shortfalls,
    count: targets.length,
    universities: targets,
  };
  writeFileSync(new URL("targets.json", out), JSON.stringify(doc, null, 2) + "\n");
  const per: Record<string, number> = {};
  for (const t of targets) per[t.country_code] = (per[t.country_code] || 0) + 1;
  console.log(`targets: ${targets.length}`, per, shortfalls.length ? { shortfalls } : "");
}
