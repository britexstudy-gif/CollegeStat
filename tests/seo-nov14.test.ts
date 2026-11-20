import assert from "node:assert/strict";
import test from "node:test";
import { AI_CRAWLERS, robotsTxt } from "../lib/seo/crawlers.mjs";
import { buildSitemaps } from "../lib/seo/sitemap.mjs";
import {
  buildArticleJsonLd,
  buildBreadcrumbJsonLd,
  buildFaqJsonLd,
  buildItemListJsonLd,
  buildScholarshipJsonLd,
  buildSiteJsonLd,
  buildUniversityJsonLd,
} from "../lib/seo/json-ld";
import { pageMetadata } from "../lib/seo/metadata";
import { universityFactsMarkdown, universityFactsView } from "../lib/seo/university-facts";
import type { University } from "../lib/domain";

type Node = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const uni = {
  id: "u1", slug: "example-u", name: "Example University", short_name: "EU", country_code: "CA",
  city: "Toronto, Ontario", website: "https://example.edu", logo_url: null, founded_year: 1827,
  university_type: "Public", latitude: 43.6, longitude: -79.4, costs: [], data_points: [], programs: [], admissions: [], tests: [], rankings: [
    { domain: "", provider: "qs", year: 2027, rank: 32, tied: false, url: "https://qs.example/r" },
  ],
  ranking_entries: [], deadlines: [], requirements: [], media: [], history: undefined,
} as unknown as University;

test("university JSON-LD is a CollegeOrUniversity with address, sameAs and founding date", () => {
  const ld = buildUniversityJsonLd(uni, "desc") as Node;
  assert.equal(ld["@context"], "https://schema.org");
  assert.equal(ld["@type"], "CollegeOrUniversity");
  assert.equal(ld.url.endsWith("/university/example-u"), true);
  assert.deepEqual(ld.sameAs, ["https://example.edu"]);
  assert.equal(ld.foundingDate, "1827");
  assert.equal(ld.address["@type"], "PostalAddress");
  assert.equal(ld.address.addressCountry, "CA");
  assert.equal("logo" in ld, false, "no logo key when none exists");
});

test("breadcrumb and item lists number their entries from 1", () => {
  const b = buildBreadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "X", path: "/x" }]) as Node;
  assert.deepEqual(b.itemListElement.map((i: Node) => i.position), [1, 2]);
  assert.match(b.itemListElement[1].item, /^https?:\/\/.+\/x$/);
  const l = buildItemListJsonLd("L", [{ name: "A", path: "/a" }, { name: "B", path: "https://other.example/b" }]) as Node;
  assert.equal(l.numberOfItems, 2);
  assert.equal(l.itemListElement[1].url, "https://other.example/b");
});

test("scholarship uses MonetaryGrant with funder and official links", () => {
  const ld = buildScholarshipJsonLd({
    slug: "pearson", name: "Pearson", provider: "University of Toronto", description: "d", covers: "Tuition and residence.",
    applicationUrl: "https://apply.example", sourceUrl: "https://apply.example", universities: [],
  });
  assert.equal(ld["@type"], "MonetaryGrant");
  assert.deepEqual(ld.funder, { "@type": "Organization", name: "University of Toronto" });
  assert.deepEqual(ld.sameAs, ["https://apply.example"]);
  assert.match(String(ld.url), /\/scholarships\/pearson$/);
  assert.equal(ld.description, "Tuition and residence. d");
  assert.equal("amount" in ld, false);
});

test("article, FAQ and site JSON-LD shapes", () => {
  const a = buildArticleJsonLd({ slug: "a", title: "T", provider: "Pub", author: null, publishedAt: "2026-01-02", url: "https://pub.example/a" }) as Node;
  assert.equal(a["@type"], "Article");
  assert.equal(a.headline, "T");
  assert.deepEqual(a.author, { "@type": "Organization", name: "Pub" });
  const f = buildFaqJsonLd([{ question: "Q", answer: "A" }]) as Node;
  assert.equal(f.mainEntity[0].acceptedAnswer.text, "A");
  const [org, site] = buildSiteJsonLd() as Node[];
  assert.equal(org["@type"], "Organization");
  assert.equal(site.potentialAction["@type"], "SearchAction");
  assert.match(site.potentialAction.target.urlTemplate, /\{search_term_string\}/);
  assert.equal(site.potentialAction["query-input"], "required name=search_term_string");
});

test("page metadata has canonical, Open Graph and Twitter tags", () => {
  const m = pageMetadata({ title: "T", description: "D", path: "/x" }) as Node;
  assert.match(m.alternates.canonical, /\/x$/);
  assert.equal(m.openGraph.description, "D");
  assert.equal(m.twitter.card, "summary_large_image");
  assert.match(m.openGraph.images[0].url, /^https?:\/\//);
  assert.equal(pageMetadata({ title: "T", description: "D", path: "/x", noindex: true }).robots !== undefined, true);
});

test("machine-readable view carries facts and sources, and renders markdown", () => {
  const v = universityFactsView(uni);
  assert.equal(v.country, "Canada");
  assert.equal(v.key_facts[0].id, "rank");
  assert.ok(v.sources.some((s) => s.url === "https://example.edu"));
  const md = universityFactsMarkdown(v);
  assert.match(md, /^# Example University/);
  assert.match(md, /## Sources/);
});

test("robots.txt welcomes AI crawlers, keeps private routes closed and lists the sitemap", () => {
  const txt = robotsTxt("https://example.test");
  for (const bot of ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "PerplexityBot", "Google-Extended", "Applebot-Extended", "Bingbot"]) {
    assert.ok(AI_CRAWLERS.includes(bot), bot);
    assert.match(txt, new RegExp(`User-agent: ${bot}\\nAllow: /api/public/\\nAllow: /\\n`));
  }
  for (const path of ["/dashboard", "/admin", "/staff", "/api/", "/auth"]) assert.match(txt, new RegExp(`Disallow: ${path}\\n`));
  assert.match(txt, /Sitemap: https:\/\/example\.test\/sitemap\.xml/);
});

test("sitemap index covers pages, scholarships and chunked universities with lastmod", () => {
  const universities = Array.from({ length: 2501 }, (_, i) => ({ slug: "u-" + i, lastmod: i === 0 ? "2026-09-26" : undefined }));
  const files = buildSitemaps({ site: "https://example.test", today: "2026-11-14", universities, scholarships: [{ slug: "pearson", lastmod: "2026-10-02T00:00:00Z" }] });
  assert.deepEqual(Object.keys(files).sort(), ["sitemap.xml", "sitemaps/pages.xml", "sitemaps/scholarships.xml", "sitemaps/universities-1.xml", "sitemaps/universities-2.xml"]);
  for (const loc of ["pages", "scholarships", "universities-1", "universities-2"]) assert.match(files["sitemap.xml"], new RegExp(`/sitemaps/${loc}\\.xml`));
  assert.match(files["sitemaps/universities-1.xml"], /<loc>https:\/\/example\.test\/university\/u-0<\/loc><lastmod>2026-09-26<\/lastmod>/);
  assert.match(files["sitemaps/universities-2.xml"], /u-2500<\/loc><lastmod>2026-11-14/);
  // Each page is listed once per language, with hreflang alternates.
  assert.match(files["sitemaps/universities-1.xml"], /<loc>https:\/\/example\.test\/university\/u-0\?lang=ru<\/loc>/);
  assert.match(files["sitemaps/universities-1.xml"], /hreflang="x-default" href="https:\/\/example\.test\/university\/u-0"/);
  assert.match(files["sitemaps/scholarships.xml"], /\/scholarships\/pearson<\/loc><lastmod>2026-10-02</);
  assert.equal((files["sitemaps/universities-1.xml"].match(/<url>/g) || []).length, 2500 * 6);
});
