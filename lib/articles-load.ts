import external from "@/data/published/external-articles-oct15.json";
import overlay from "@/data/review/content-articles-nov15.json";
import { mergeArticles, type Article, type ArticleOverlay } from "./articles-data";

// import.meta.glob is compiled away by Vite; plain Node (tests) has no reviewed files to read.
// The glob also matches nothing until the review folder exists.
const vite = !!(import.meta as { env?: unknown }).env;
const reviewedFiles = vite
  ? (import.meta.glob("../data/review/articles-nov14/*.json", { eager: true, import: "default" }) as Record<string, unknown>)
  : {};

const reviewed = Object.values(reviewedFiles).flatMap((f) =>
  Array.isArray(f) ? f : (f as { records?: unknown[] })?.records ?? [f],
) as Record<string, unknown>[];

/** Publisher articles plus our own reviewed ones that are approved. */
export const allArticles: Article[] = mergeArticles(
  (external as { records: Record<string, unknown>[] }).records,
  reviewed,
  overlay as unknown as ArticleOverlay,
);
export const getArticle = (slug: string) => allArticles.find((a) => a.slug === slug);

const unlisted = new Set((overlay as unknown as ArticleOverlay).unlisted ?? []);
/** The library list: our own complete guides only. Outside summaries keep their pages but are not listed. */
export const listedArticles: Article[] = allArticles.filter((a) => a.kind === "own" && !unlisted.has(a.slug));
