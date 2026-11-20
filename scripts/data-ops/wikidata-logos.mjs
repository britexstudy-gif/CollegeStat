// Official logos (Wikidata P154, hosted on Wikimedia Commons) and founding years
// (P571) for published universities that lack them.
//
//   node scripts/data-ops/wikidata-logos.mjs
//
// Output: data/review/wikidata-nov20/import/rows.json with "patches": field values
// that scripts/d1/build-d1.ts applies only where the field is still empty.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");
const ROOT = new URL("../../", import.meta.url);
const OUT = new URL("data/review/wikidata-nov20/import/", ROOT);
mkdirSync(OUT, { recursive: true });
const UA = "CollegeStatBot/1.0 (https://collegestat.xyz; university logos)";

const cat = new URL("data/generated/catalogue/", ROOT);
const want = [];
for (const f of readdirSync(cat).filter((n) => n.startsWith("shard-")))
  for (const u of Object.values(JSON.parse(readFileSync(new URL(f, cat), "utf8")))) {
    const q = u.identifiers?.wikidata;
    if (u.published === false || typeof q !== "string" || !/^Q\d+$/.test(q)) continue;
    if (!u.logo_url || !u.founded_year) want.push({ id: u.id, q, logo: !u.logo_url, founded: !u.founded_year });
  }
console.log(`${want.length} universities to check`);

async function json(url) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(30000) });
      if (r.ok) return await r.json();
      if (r.status === 429) await new Promise((d) => setTimeout(d, 5000 * (i + 1)));
    } catch {}
  }
  return null;
}

const patches = [];
let logos = 0, years = 0;
for (let i = 0; i < want.length; i += 50) {
  const chunk = want.slice(i, i + 50);
  const j = await json(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${chunk.map((c) => c.q).join("|")}&props=claims&format=json`);
  for (const c of chunk) {
    const claims = j?.entities?.[c.q]?.claims || {};
    const fields = {};
    const logo = claims.P154?.find((x) => x.rank !== "deprecated")?.mainsnak?.datavalue?.value;
    if (c.logo && typeof logo === "string" && /\.(svg|png)$/i.test(logo)) {
      const name = logo.replace(/ /g, "_");
      fields.logo_url = "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(name) + "?width=256";
      fields.logo_source_url = "https://commons.wikimedia.org/wiki/File:" + encodeURIComponent(name);
      fields.logo_usage_notes = "Official logo from Wikidata (P154), hosted on Wikimedia Commons. Used to identify the institution.";
      logos++;
    }
    const time = claims.P571?.[0]?.mainsnak?.datavalue?.value?.time;
    const year = typeof time === "string" ? Number(time.slice(1, 5)) : NaN;
    if (c.founded && year > 900 && year <= 2026) {
      fields.founded_year = year;
      years++;
    }
    if (Object.keys(fields).length) patches.push({ university_id: c.id, fields });
  }
  if (i % 2000 === 0) console.log(`  ${i}/${want.length}: logos ${logos}, founding years ${years}`);
}
writeFileSync(new URL("rows.json", OUT), JSON.stringify({ data_sources: [], requirements: [], costs: [], deadlines: [], admissions: [], patches }, null, 1));
console.log(`logos: ${logos}, founding years: ${years}`);
