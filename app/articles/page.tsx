import type { Metadata } from "next";
import { ArticleLibrary } from "@/components/college/article-library";
import { listedArticles } from "@/lib/articles-load";
import { JsonLd } from "@/components/seo/json-ld";
import { buildBreadcrumbJsonLd, buildItemListJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { localizedArticle } from "@/lib/articles-i18n";
import { requestLang } from "@/lib/request-lang";

export const metadata: Metadata = pageMetadata({
  title: "Articles on applying to university abroad",
  description:
    "Guides on choosing universities, applications, IELTS and SAT, essays, scholarships, visas and moving, plus the best advice from admissions teams.",
  path: "/articles",
});

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const lang = await requestLang();
  const english = new Map(listedArticles.map((a) => [a.slug, a.title]));
  const items = [...listedArticles]
    .sort((a, b) => Number(b.featured) - Number(a.featured))
    .map((a) => localizedArticle(a, lang))
    .map((a) => ({
      slug: a.slug, title: a.title, summary: a.summary, category: a.category, kind: a.kind, publisher: a.publisher, author: a.author,
      publishedAt: a.publishedAt, dateLabel: a.dateLabel, readingMinutes: a.readingMinutes, centralAsia: a.centralAsia,
      featured: a.featured, url: a.url, countryCode: a.countryCode, image: a.image, updatedAt: a.updatedAt, checkedAt: a.checkedAt,
    }));
  return (
    <div className="public-page-shell">
      <JsonLd
        data={[
          buildBreadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Articles", path: "/articles" }]),
          buildItemListJsonLd("Articles", items.filter((a) => a.kind === "own").slice(0, 50).map((a) => ({ name: english.get(a.slug) ?? a.title, path: "/articles/" + a.slug }))),
        ]}
      />
      <ArticleLibrary renderedLang={lang} key={one(query.category) + one(query.q)} items={items} initialCategory={one(query.category) || "all"} initialQuery={one(query.q).slice(0, 200)} />
    </div>
  );
}
