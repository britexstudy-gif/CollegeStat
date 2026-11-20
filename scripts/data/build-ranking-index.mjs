// Writes data/published/ranking-profile-index.json: the few fields the rankings
// page needs for every university that appears in a ranking table, so the page
// never loads the 50 MB catalogue list. Run: node scripts/data/build-ranking-index.mjs
import { readFileSync, writeFileSync } from "node:fs";
const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const list = read("data/generated/catalogue/list.json");
const ids = new Set();
for (const r of read("data/published/ranking-all.json")) if (r.university_id) ids.add(r.university_id);
const cited = read("data/published/cited-ranking-tables-oct20.json");
for (const r of cited.cwur) if (r[4]) ids.add(r[4]);
for (const r of read("data/published/reviewed-webometrics-oct15.json").records) if (r.university_id) ids.add(r.university_id);
for (const r of read("data/published/reviewed-unirank-oct15.json").records) if (r.university_id) ids.add(r.university_id);
for (const p of read("data/published/reviewed-national-rankings.json").providers)
  for (const r of p.records) if (r.university_id) ids.add(r.university_id);
const keep = (v) => (v && v !== "None" ? v : null);
const out = {};
for (const u of list) {
  if (!ids.has(u.id)) continue;
  out[u.id] = [u.slug, u.name, keep(u.city), keep(u.website), keep(u.logo_url), keep(u.website_icon_url), keep(u.institution_image_url), u.country_code, (u.aliases || []).slice(0, 6)];
}
writeFileSync("data/published/ranking-profile-index.json", JSON.stringify(out));
console.log(Object.keys(out).length, "profiles");
