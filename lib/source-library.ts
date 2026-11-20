import snapshot from "@/data/published/official-admissions-sources.json";
import { getArticle } from "./article-library";

/** Historic guide destinations only. These are never shown as articles. */
export type LegacySourceLink = {
  slug: string;
  title: string;
  provider: string;
  url: string;
};

export const legacySourceLinks = snapshot.records as LegacySourceLink[];

export function getSource(slug: string): LegacySourceLink | undefined {
  return legacySourceLinks.find((source) => source.slug === slug);
}

export function articleDestination(slug: string): string | undefined {
  return getArticle(slug)?.url || getSource(slug)?.url;
}

// Retained export name for callers migrating to the article-specific API.
export { featuredArticles as featuredSources } from "./article-library";
