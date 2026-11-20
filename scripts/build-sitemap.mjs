// Writes public/robots.txt, public/sitemap.xml (index) and public/sitemaps/*.xml:
// static pages, every published scholarship and one file per 10,000 universities.
// Run with tsx (npm run sitemap). Runs before every build; set SITE_URL or NEXT_PUBLIC_SITE_URL for the real domain.
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { robotsTxt } from "../lib/seo/crawlers.mjs";
import { buildSitemaps } from "../lib/seo/sitemap.mjs";

const root = new URL("../", import.meta.url);
const site = (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://collegestat.xyz").replace(/\/+$/, "");
const read = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const universities = read("data/published/global-directory.json")
  .filter((u) => /^[a-z0-9-]{1,160}$/.test(u.slug))
  .map((u) => ({ slug: u.slug, lastmod: u.identity_retrieved_at }));
// Same merge the site uses (published + researched + reviewed), so every scholarship page is listed.
const { mergeScholarships } = await import("../lib/scholarships-data.ts");
const reviewedPath = new URL("data/review/scholarships-nov14.json", root);
const reviewed = existsSync(reviewedPath) ? read("data/review/scholarships-nov14.json") : [];
const scholarships = mergeScholarships(
  [read("data/published/scholarships-current.json"), read("data/published/scholarships-researched.json").records],
  Array.isArray(reviewed) ? reviewed : (reviewed.records ?? []),
)
  .filter((s) => /^[a-z0-9-]{1,160}$/.test(s.slug))
  .map((s) => ({ slug: s.slug, lastmod: s.checkedAt }));
const files = buildSitemaps({
  site,
  today: new Date().toISOString().slice(0, 10),
  universities,
  scholarships,
  articlesCheckedAt: read("data/published/external-articles-oct15.json").checkedAt,
});
rmSync(new URL("public/sitemaps/", root), { recursive: true, force: true });
for (const [name, xml] of Object.entries(files)) {
  const target = new URL("public/" + name, root);
  mkdirSync(dirname(target.pathname), { recursive: true });
  writeFileSync(target, xml);
}
writeFileSync(new URL("public/robots.txt", root), robotsTxt(site));
console.log(`sitemap: ${universities.length} universities, ${scholarships.length} scholarships → ${site}`);
