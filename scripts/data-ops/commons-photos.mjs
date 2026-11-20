// Campus photos from Wikidata (P18 image) + Wikimedia Commons, for published
// universities that have no campus photo yet. Free licences only (CC0, CC BY,
// CC BY-SA, public domain); author and licence are kept for the credit line.
//
//   node scripts/data-ops/commons-photos.mjs
//
// Output: data/review/commons-photos-nov20/import/rows.json ("media" rows in the
// gap-fill package format read by scripts/d1/build-d1.ts).
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");
const ROOT = new URL("../../", import.meta.url);
const OUT = new URL("data/review/commons-photos-nov20/import/", ROOT);
mkdirSync(OUT, { recursive: true });
const UA = "CollegeStatBot/1.0 (https://collegestat.xyz; university photo credits)";
const CHECKED = "2026-11-20";
const FREE = /^(cc0|cc[- ]by(-sa)?[- ]?\d|public domain|pd\b|pd-)/i;

const cat = new URL("data/generated/catalogue/", ROOT);
const need = [];
for (const f of readdirSync(cat).filter((n) => n.startsWith("shard-")))
  for (const u of Object.values(JSON.parse(readFileSync(new URL(f, cat), "utf8")))) {
    if (u.published === false) continue;
    if ((u.media || []).some((m) => m.kind === "campus") || u.institution_image_url) continue;
    const q = u.identifiers?.wikidata;
    if (typeof q === "string" && /^Q\d+$/.test(q)) need.push({ id: u.id, name: u.name, q });
  }
console.log(`${need.length} universities without a photo but with a Wikidata id`);

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

// 1. Wikidata: the P18 image file name of each university.
const fileOf = new Map();
for (let i = 0; i < need.length; i += 50) {
  const ids = need.slice(i, i + 50).map((n) => n.q).join("|");
  const j = await json(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=claims&format=json`);
  for (const [q, e] of Object.entries(j?.entities || {})) {
    const file = e.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (typeof file === "string") fileOf.set(q, file);
  }
  if (i % 1000 === 0) console.log(`  wikidata ${i}/${need.length}, images ${fileOf.size}`);
}

// 2. Commons: thumbnail, size, licence and author of each file.
const info = new Map();
const files = [...new Set(fileOf.values())];
for (let i = 0; i < files.length; i += 50) {
  const titles = files.slice(i, i + 50).map((f) => "File:" + f).join("|");
  const j = await json(
    `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1280&format=json`,
  );
  for (const p of Object.values(j?.query?.pages || {})) {
    const ii = p.imageinfo?.[0];
    if (!ii) continue;
    const meta = ii.extmetadata || {};
    const plain = (v) => String(v?.value || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    info.set(p.title.replace(/^File:/, ""), {
      thumb: ii.thumburl || ii.url,
      width: ii.thumbwidth || ii.width,
      height: ii.thumbheight || ii.height,
      page: ii.descriptionurl,
      license: plain(meta.LicenseShortName),
      licenseUrl: plain(meta.LicenseUrl) || null,
      artist: plain(meta.Artist).slice(0, 120) || "Wikimedia Commons contributor",
      desc: plain(meta.ImageDescription).slice(0, 160),
    });
  }
}

const media = [];
let skipped = 0;
for (const n of need) {
  const file = fileOf.get(n.q);
  const m = file && info.get(file.replace(/_/g, " "));
  if (!m) continue;
  if (!FREE.test(m.license) || !m.thumb || (m.width && m.width < 600)) {
    skipped++;
    continue;
  }
  media.push({
    kind: "campus",
    url: m.thumb,
    source_url: m.page,
    creator: m.artist,
    license: m.license,
    license_url: m.licenseUrl,
    width: m.width,
    height: m.height,
    alt: m.desc || n.name,
    id: n.id + ":commons:p18",
    university_id: n.id,
    professor_id: null,
    year: null,
    source_id: "commons",
    verified_at: CHECKED,
    verification_status: "verified",
    reuse_permitted: true,
    notes: "Campus photo from the university's Wikidata image (P18) on Wikimedia Commons; freely licensed, credited to its author.",
  });
}
writeFileSync(new URL("rows.json", OUT), JSON.stringify({ data_sources: [], requirements: [], costs: [], deadlines: [], admissions: [], media }, null, 1));
console.log(`photos: ${media.length} added, ${skipped} skipped (non-free licence or too small)`);
