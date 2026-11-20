import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { JsonLd } from "@/components/seo/json-ld";
import { allArticles, getArticle, listedArticles } from "@/lib/articles-load";
import { getScholarship } from "@/lib/scholarships-load";
import { adjacentArticles, relatedArticles, type Article } from "@/lib/articles-data";
import { buildArticleJsonLd, buildBreadcrumbJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { absoluteUrl } from "@/lib/seo/site";
import { articleDestination } from "@/lib/source-library";
import { localizedArticle } from "@/lib/articles-i18n";
import { requestLang } from "@/lib/request-lang";
import type { Lang } from "@/lib/i18n/languages";

/** Our guides, and outside articles we summarise. Retired outside articles redirect to the original. */
const own = (slug: string) => getArticle(slug);
const ownArticles = listedArticles;

export const generateStaticParams = () => allArticles.map((a) => ({ id: a.slug }));

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const a = own((await params).id);
  if (!a) return { title: "Article" };
  return pageMetadata({
    title: a.title,
    description: a.summary ?? `${a.title}: a CollegeStat guide.`,
    path: "/articles/" + a.slug,
    image: { url: "/og/article/" + a.slug, alt: a.title, card: true },
  });
}

const lite = (lang: Lang) => (article: Article) => {
  const a = localizedArticle(article, lang);
  return { slug: a.slug, title: a.title, publisher: a.publisher, kind: a.kind, readingMinutes: a.readingMinutes, url: a.url, category: a.category, summary: a.summary, image: a.image };
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = own(id);
  if (!a) {
    const destination = articleDestination(id);
    if (!destination) notFound();
    redirect(destination);
  }
  const { ArticleReader } = await import("@/components/college/article-reader");
  // The English page stays canonical (metadata and JSON-LD); readers see their interface language.
  const lang = await requestLang();
  const shown = localizedArticle(a, lang);
  const ref = lite(lang);
  const { prev, next } = a.kind === "own" ? adjacentArticles(ownArticles, a) : { prev: null, next: null };
  return (
    <div className="public-page-shell">
      <ArticleReader
        article={shown}
        original={shown.translated ? { title: a.title, summary: a.summary, body: a.body } : null}
        renderedLang={lang}
        related={[...relatedArticles(listedArticles, a), ...listedArticles.filter((x) => x.slug !== a.slug && x.category !== a.category)].slice(0, 3).map(ref)}
        scholarships={a.links.scholarships
          .map((slug) => getScholarship(slug))
          .filter((x) => !!x)
          .map((x) => ({ slug: x.slug, name: x.name, country: x.country }))}
        prev={prev && ref(prev)}
        next={next && ref(next)}
        jsonLd={
          <JsonLd
            data={[buildBreadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Articles", path: "/articles" }, { name: a.title, path: "/articles/" + a.slug }]), buildArticleJsonLd({
              slug: a.slug,
              title: a.title,
              provider: a.kind === "own" ? "CollegeStat" : (a.publisher ?? "CollegeStat"),
              author: a.author,
              publishedAt: a.publishedAt,
              checkedAt: a.updatedAt ?? a.checkedAt,
              url: absoluteUrl("/articles/" + a.slug),
              summary: a.summary ?? undefined,
            })]}
          />
        }
      />
    </div>
  );
}
