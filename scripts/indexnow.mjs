// Tells Bing, Yandex and other IndexNow engines about every URL in the live sitemap.
// Usage: node scripts/indexnow.mjs [--only <substring>]   (run after each deploy)
const SITE = "https://collegestat.xyz";
const KEY = "e5fefe3a11ff2b94ed06a4cd96ee16f7"; // public by design: served at /<key>.txt
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : "";

const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${u} ${r.status}`); return r.text(); };

const index = await get(`${SITE}/sitemap.xml`);
let urls = [];
for (const sm of locs(index)) urls.push(...locs(await get(sm)));
urls = [...new Set(urls)].filter((u) => u.startsWith(SITE) && (!only || u.includes(only)));
console.log(`${urls.length} URLs`);

for (let i = 0; i < urls.length; i += 10000) {
  const urlList = urls.slice(i, i + 10000);
  const r = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: "collegestat.xyz", key: KEY, keyLocation: `${SITE}/${KEY}.txt`, urlList }),
  });
  console.log(`batch ${i / 10000 + 1}: ${urlList.length} URLs -> ${r.status} ${await r.text().catch(() => "")}`.trim());
}
