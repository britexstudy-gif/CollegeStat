/** Translations of our own guides: data/review/articles-i18n/<lang>/<slug>.json,
 * each `{ slug, title, summary, body }` with the same markdown as the English
 * body. Any field a file lacks stays in English. */
import type { Article } from "./articles-data";
import { DEFAULT_LANG, isLang, type Lang } from "./i18n/languages";

export type ArticleText = { title: string; summary: string | null; body: string | null };
type Table = Map<string, Partial<ArticleText>>;

// import.meta.glob is compiled away by Vite; plain Node (tests) has no files to read.
const vite = !!(import.meta as { env?: unknown }).env;
const files = vite
  ? (import.meta.glob("../data/review/articles-i18n/*/*.json", { eager: true, import: "default" }) as Record<string, unknown>)
  : {};

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** Builds the `<lang>/<slug>` lookup from glob results keyed by file path. */
export function translationTable(found: Record<string, unknown>): Table {
  const table: Table = new Map();
  for (const [path, raw] of Object.entries(found)) {
    const m = path.match(/articles-i18n\/([a-z]{2})\/([^/]+)\.json$/);
    if (!m || !isLang(m[1]) || m[1] === DEFAULT_LANG || !raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const entry = { title: text(r.title), summary: text(r.summary), body: text(r.body) };
    if (entry.title || entry.summary || entry.body) table.set(m[1] + "/" + (text(r.slug) ?? m[2]), entry);
  }
  return table;
}

const translations = translationTable(files);

type Localizable = Pick<Article, "slug" | "title" | "summary">;

/** The article in `lang`, field by field, falling back to English. `translated`
 * is true when any field came from a translation. */
export function localizedArticle<T extends Localizable & { body?: string | null }>(
  article: T,
  lang: Lang,
  table: Table = translations,
): T & { translated: boolean } {
  const tr = lang === DEFAULT_LANG ? undefined : table.get(lang + "/" + article.slug);
  if (!tr) return { ...article, translated: false };
  return {
    ...article,
    title: tr.title ?? article.title,
    summary: tr.summary ?? article.summary,
    ...("body" in article ? { body: tr.body ?? article.body } : {}),
    translated: true,
  };
}
