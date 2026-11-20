export const SITEMAP_CHUNK: number;
export const STATIC_PAGES: string[];
export function buildSitemaps(input: {
  site: string;
  today: string;
  universities: { slug: string; lastmod?: string | null }[];
  scholarships?: { slug: string; lastmod?: string | null }[];
  articlesCheckedAt?: string | null;
}): Record<string, string>;
