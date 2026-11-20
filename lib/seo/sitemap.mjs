/** Pure sitemap generation shared by scripts/build-sitemap.mjs and the tests. */
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const SITEMAP_CHUNK = 10000;
export const STATIC_PAGES = ["/", "/universities", "/rankings", "/scholarships", "/compare", "/articles", "/support", "/methodology", "/sources", "/about"];
const day = (value, fallback) => (/^\d{4}-\d{2}-\d{2}/.test(value || "") ? value.slice(0, 10) : fallback);

const urlset = (entries) =>
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  entries.map(([loc, lastmod, freq, priority]) => `<url><loc>${esc(loc)}</loc><lastmod>${lastmod}</lastmod><changefreq>${freq}</changefreq><priority>${priority}</priority></url>`).join("\n") +
  "\n</urlset>\n";

/** universities: {slug, lastmod?}; scholarships: {slug, lastmod?}. Returns { "sitemaps/x.xml": xml, "sitemap.xml": index }. */
export function buildSitemaps({ site, today, universities, scholarships = [], articlesCheckedAt }) {
  const out = {};
  const names = [];
  const add = (name, entries) => {
    out["sitemaps/" + name] = urlset(entries);
    names.push(name);
  };
  add("pages.xml", [
    ...STATIC_PAGES.map((p) => [site + p, p === "/articles" ? day(articlesCheckedAt, today) : today, "weekly", p === "/" ? "1.0" : "0.8"]),
  ]);
  add("scholarships.xml", scholarships.map((s) => [site + "/scholarships/" + s.slug, day(s.lastmod, today), "weekly", "0.7"]));
  for (let i = 0; i < universities.length; i += SITEMAP_CHUNK)
    add(`universities-${i / SITEMAP_CHUNK + 1}.xml`, universities.slice(i, i + SITEMAP_CHUNK).map((u) => [site + "/university/" + u.slug, day(u.lastmod, today), "monthly", "0.7"]));
  out["sitemap.xml"] =
    '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    names.map((n) => `<sitemap><loc>${esc(site + "/sitemaps/" + n)}</loc><lastmod>${today}</lastmod></sitemap>`).join("\n") +
    "\n</sitemapindex>\n";
  return out;
}
