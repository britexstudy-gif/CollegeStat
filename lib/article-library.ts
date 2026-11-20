import snapshot from "@/data/published/external-articles-oct15.json";

export type ArticleCategory =
  | "applications"
  | "tests"
  | "choosing-university"
  | "student-life"
  | "money"
  | "study-abroad";

/** Original publisher metadata only. There is no CollegeStat article body. */
export type ExternalArticle = {
  slug: string;
  title: string;
  provider: string;
  author: string | null;
  publishedAt: string | null;
  dateLabel: string | null;
  category: ArticleCategory;
  countryCode: string | null;
  url: string;
  featured: boolean;
  checkedAt: string;
  contentImported: false;
  verificationMethod: string;
  /** Short description written for CollegeStat; never the publisher's text. */
  summary?: string;
  /** Publisher headers allow framing, so the in-app reader can embed it. */
  embeddable?: boolean;
};

export const externalArticles = snapshot.records as ExternalArticle[];
export const featuredArticles = externalArticles.filter(
  (article) => article.featured,
);

export const articleTopics = [
  { id: "all", label: "All articles" },
  { id: "applications", label: "Applications & essays" },
  { id: "tests", label: "Tests & English" },
  { id: "choosing-university", label: "Choosing your path" },
  { id: "student-life", label: "Student life" },
  { id: "money", label: "Money & funding" },
  { id: "study-abroad", label: "International experiences" },
] as const;

export type ArticleTopic = (typeof articleTopics)[number]["id"];

export function articleTopic(value: unknown): ArticleTopic {
  return articleTopics.some((topic) => topic.id === value)
    ? (value as ArticleTopic)
    : "all";
}

export function getArticle(slug: string): ExternalArticle | undefined {
  return externalArticles.find((article) => article.slug === slug);
}

export function matchingArticles(
  topic: string,
  query: string,
): ExternalArticle[] {
  const category = articleTopic(topic);
  const term = query.trim().toLocaleLowerCase().slice(0, 200);
  return externalArticles.filter((article) => {
    if (category !== "all" && article.category !== category) return false;
    return (
      !term ||
      [article.title, article.provider, article.author, article.countryCode]
        .join(" ")
        .toLocaleLowerCase()
        .includes(term)
    );
  });
}

export function articleDate(article: ExternalArticle): string | null {
  if (article.dateLabel) return article.dateLabel;
  if (!article.publishedAt) return null;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${article.publishedAt}T00:00:00Z`));
}
