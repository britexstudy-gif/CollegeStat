"use client";
import { useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { useI18n, useT } from "./i18n";
import { categoryLabel } from "./article-format";
import { formatDate, localeOf } from "@/lib/dates";
import { ScholarshipCover } from "./scholarship-cover";
import { filterArticles, usedCategories, type Article } from "@/lib/articles-data";
import { useRefreshOnLang } from "./use-refresh-on-lang";
import type { Lang } from "@/lib/i18n/languages";
import "./article-library.css";

export type ArticleRow = Pick<
  Article,
  | "slug"
  | "title"
  | "summary"
  | "category"
  | "kind"
  | "publisher"
  | "author"
  | "publishedAt"
  | "dateLabel"
  | "readingMinutes"
  | "centralAsia"
  | "featured"
  | "url"
  | "countryCode"
  | "image"
  | "updatedAt"
  | "checkedAt"
>;

/** "6 min read · Updated 14 Nov 2026" */
function useMeta(a: ArticleRow) {
  const t = useT();
  const { lang } = useI18n();
  const updated = a.updatedAt ?? a.checkedAt ?? a.publishedAt;
  return [a.readingMinutes ? t("art.minutes", { n: a.readingMinutes }) : null, updated ? t("art.updated", { date: formatDate(updated, localeOf(lang)) }) : null]
    .filter(Boolean)
    .join(" · ");
}

function Card({ a }: { a: ArticleRow }) {
  const t = useT();
  const meta = useMeta(a);
  return (
    <li>
      <Link href={"/articles/" + a.slug} className="al-card">
        <ScholarshipCover slug={a.slug} image={a.image} className="al-card-cover" />
        <span className="al-card-body">
          <span className="al-kicker">{categoryLabel(a.category, t)}</span>
          <span className="al-title">{a.title}</span>
          {a.summary && <span className="al-summary">{a.summary}</span>}
          <span className="al-meta">{meta}</span>
        </span>
      </Link>
    </li>
  );
}

function Feature({ a }: { a: ArticleRow }) {
  const t = useT();
  const meta = useMeta(a);
  return (
    <Link href={"/articles/" + a.slug} className="al-feature">
      <ScholarshipCover slug={a.slug} image={a.image} className="al-feature-cover" eager />
      <span className="al-feature-body">
        <span className="al-kicker">
          {t("art.featuredOne")} · {categoryLabel(a.category, t)}
        </span>
        <span className="al-title">{a.title}</span>
        {a.summary && <span className="al-summary">{a.summary}</span>}
        <span className="al-meta">{meta}</span>
        <span className="al-read">
          {t("art.readGuide")} <ArrowRight size={16} aria-hidden="true" />
        </span>
      </span>
    </Link>
  );
}

/** Library: one featured guide, topic filters, then one clean grid (each card names its topic). Every card opens a full guide on CollegeStat. */
export function ArticleLibrary({
  items,
  initialCategory = "all",
  initialQuery = "",
  renderedLang,
}: {
  items: ArticleRow[];
  initialCategory?: string;
  initialQuery?: string;
  /** The language the route rendered titles and summaries in. */
  renderedLang?: Lang;
}) {
  const t = useT();
  useRefreshOnLang(renderedLang);
  const [category, setCategory] = useState(initialCategory);
  const [query, setQuery] = useState(initialQuery.slice(0, 200));
  const id = useId();
  const search = useRef<HTMLInputElement>(null);
  const all = items as Article[];
  const cats = useMemo(() => usedCategories(all), [all]);
  const shown = useMemo(() => filterArticles(all, category, query) as ArticleRow[], [all, category, query]);
  const flat = category !== "all" || !!query.trim();
  const featured = items.find((a) => a.featured) ?? items[0];

  const reset = () => {
    setCategory("all");
    setQuery("");
    search.current?.focus();
  };

  return (
    <div className="al">
      <header className="al-head">
        <div className="al-head-text">
          <h1>{t("art.title")}</h1>
          <p>{t("art.lead2", { n: items.length })}</p>
        </div>
      </header>

      {!flat && featured && <Feature a={featured} />}

      <div className="al-tools">
        <nav className="al-cats" aria-label={t("art.topics")}>
          {[{ id: "all" }, ...cats].map((c) => (
            <button key={c.id} type="button" aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>
              {c.id === "all" ? t("art.cat.all") : categoryLabel(c.id, t)}
            </button>
          ))}
        </nav>
        <label className="al-search" htmlFor={id}>
          <Search size={16} aria-hidden="true" />
          <input id={id} ref={search} type="search" value={query} maxLength={200} autoComplete="off" placeholder={t("art.search")} aria-label={t("art.search")} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      {flat && (
        <p className="al-count" role="status" aria-live="polite">
          {t("art.count", { n: shown.length })}{" "}
          <button type="button" onClick={reset}>
            {t("art.clear")}
          </button>
        </p>
      )}

      <ul className="al-grid">
        {(flat ? shown : shown.filter((a) => a !== featured)).map((a) => (
          <Card key={a.slug} a={a} />
        ))}
      </ul>
      {!shown.length && <p className="al-none">{t("art.none")}</p>}
    </div>
  );
}
