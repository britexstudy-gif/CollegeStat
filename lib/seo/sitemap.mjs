/** Pure sitemap generation shared by scripts/build-sitemap.mjs and the tests. */
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const SITEMAP_CHUNK = 2500;
export const STATIC_PAGES = ["/", "/universities", "/rankings", "/scholarships", "/compare", "/articles", "/support", "/methodology", "/sources", "/about"];
const day = (value, fallback) => (/^\d{4}-\d{2}-\d{2}/.test(value || "") ? value.slice(0, 10) : fallback);

/** Every page exists in each interface language at ?lang=xx (English has none);
 * each <url> lists all of them so search engines index every language. */
export const SITEMAP_LANGS = [["en", "en"], ["ru", "ru"], ["uz", "uz"], ["es", "es"], ["de", "de"], ["zh", "zh-Hans"]];
const langHref = (loc, code) => (code === "en" ? loc : loc + (loc.includes("?") ? "&" : "?") + "lang=" + code);
const alternates = (loc) =>
  SITEMAP_LANGS.map(([code, tag]) => `<xhtml:link rel="alternate" hreflang="${tag}" href="${esc(langHref(loc, code))}"/>`).join("") +
  `<xhtml:link rel="alternate" hreflang="x-default" href="${esc(loc)}"/>`;
const urlset = (entries) =>
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
  entries
    .flatMap(([loc, lastmod, freq, priority]) =>
      SITEMAP_LANGS.map(([code]) => `<url><loc>${esc(langHref(loc, code))}</loc><lastmod>${lastmod}</lastmod><changefreq>${freq}</changefreq><priority>${priority}</priority>${alternates(loc)}</url>`),
    )
    .join("\n") +
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
