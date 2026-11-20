"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, Award, GraduationCap, Languages } from "lucide-react";
import { useI18n, useT } from "./i18n";
import { Blocks, articleDateText, categoryLabel } from "./article-format";
import { formatDate, localeOf } from "@/lib/dates";
import { CoverCredit, ScholarshipCover } from "./scholarship-cover";
import { flagOf } from "./scholarship-format";
import { ContentVideo } from "./content-video";
import { parseMarkdown, tableOfContents, type Article } from "@/lib/articles-data";
import type { ArticleText } from "@/lib/articles-i18n";
import type { Lang } from "@/lib/i18n/languages";
import { useRefreshOnLang } from "./use-refresh-on-lang";
import "./article-reader.css";

type Ref = Pick<Article, "slug" | "title" | "publisher" | "kind" | "readingMinutes" | "url" | "category" | "summary" | "image">;
export type Mention = { slug: string; name: string; country: string | null };

/** Thin bar at the top that fills as the reader scrolls through the article body. */
function Progress({ target }: { target: React.RefObject<HTMLElement | null> }) {
  const [p, setP] = useState(0);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const el = target.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight * 0.6;
      setP(Math.max(0, Math.min(1, total > 0 ? -r.top / total : 1)));
    };
    const on = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
      cancelAnimationFrame(frame);
    };
  }, [target]);
  return <div className="rd-progress" style={{ transform: `scaleX(${p})` }} aria-hidden="true" />;
}

/** Highlights the section the reader is in: the last heading that has scrolled past the top. */
function useActiveHeading(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join("|");
  useEffect(() => {
    if (!key) return;
    const list = key.split("|");
    let frame = 0;
    const update = () => {
      frame = 0;
      let current: string | null = null;
      for (const id of list) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < 140) current = id;
      }
      setActive(current);
    };
    const on = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", on, { passive: true });
    return () => {
      window.removeEventListener("scroll", on);
      cancelAnimationFrame(frame);
    };
  }, [key]);
  return active;
}

/** One article page. Our guides show the full text; outside articles show our summary and key points with a link to the original. */
export function ArticleReader({
  article: translated,
  original = null,
  renderedLang,
  related,
  prev,
  next,
  jsonLd,
  scholarships = [],
}: {
  article: Article;
  related: Ref[];
  prev: Ref | null;
  next: Ref | null;
  jsonLd?: React.ReactNode;
  /** Scholarship pages this guide is about (names resolved by the route). */
  scholarships?: Mention[];
  /** The English text when `article` carries a translation. */
  original?: ArticleText | null;
  /** The language the route rendered `article` in. */
  renderedLang?: Lang;
}) {
  const t = useT();
  const { lang } = useI18n();
  useRefreshOnLang(renderedLang);
  const [showOriginal, setShowOriginal] = useState(false);
  const a: Article = showOriginal && original ? { ...translated, ...original } : translated;
  const textLang = original ? (showOriginal ? "en" : renderedLang) : undefined;
  const locale = localeOf(lang);
  const body = useRef<HTMLDivElement>(null);
  const own = a.kind === "own";
  const blocks = a.body ? parseMarkdown(a.body) : [];
  const toc = tableOfContents(blocks).filter((h) => h.type === "h2");
  const showToc = own && toc.length >= 4;
  const active = useActiveHeading(showToc ? toc.map((h) => h.id) : []);
  const tocBox = useRef<HTMLDetailsElement>(null);
  // Without room for the side rail the contents sit above the text; start them folded so the story begins at once.
  useEffect(() => {
    const el = tocBox.current;
    if (el && body.current && body.current.clientWidth < 1160) el.open = false;
  }, [showToc]);
  const date = articleDateText(a, locale);
  const author = own ? a.author ?? "CollegeStat" : a.author ?? a.publisher;
  const initials = (author ?? "C")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const updated = a.updatedAt ?? a.checkedAt;
  const meta = [
    own ? null : a.publisher,
    own && a.readingMinutes ? t("art.minutes", { n: a.readingMinutes }) : null,
    own && updated ? t("art.updated", { date: formatDate(updated, locale, "long") }) : date,
  ].filter(Boolean);
  const unis = a.links.universities;
  const hasMentions = unis.length > 0 || scholarships.length > 0;

  return (
    <article className="rd">
      {jsonLd}
      <Progress target={body} />
      <div className="rd-col">
        <Link href="/articles" className="rd-back">
          <ArrowLeft size={15} aria-hidden="true" /> {t("art.back")}
        </Link>
        <header className="rd-head">
          <p className="rd-kicker">
            {categoryLabel(a.category, t)}
            {!own && <span>{t("art.summaryTag")}</span>}
          </p>
          <h1 lang={textLang}>{a.title}</h1>
          {own && a.summary && (
            <p className="rd-dek" lang={textLang}>
              {a.summary}
            </p>
          )}
          <div className="rd-byline">
            <span className="rd-avatar" aria-hidden="true">
              {initials}
            </span>
            <span>
              <strong>{author}</strong>
              <small>{meta.join(" · ")}</small>
            </span>
          </div>
          {original && (
            <p className="rd-tr">
              <Languages size={14} aria-hidden="true" />
              <span>{showOriginal ? t("art.tr.showing") : t("art.tr.note")}</span>
              <span aria-hidden="true">·</span>
              <button type="button" aria-pressed={showOriginal} onClick={() => setShowOriginal((v) => !v)}>
                {showOriginal ? t("art.tr.back") : t("art.tr.original")}
              </button>
            </p>
          )}
        </header>
      </div>

      {a.image && (
        <figure className="rd-cover">
          <ScholarshipCover slug={a.slug} image={a.image} className="rd-cover-img" eager />
          <figcaption>
            <CoverCredit image={a.image} label={t("sch.photo")} />
          </figcaption>
        </figure>
      )}

      <div className={"rd-body" + (showToc ? " has-toc" : "")} ref={body}>
        {showToc && (
          <nav className="rd-toc" aria-label={t("art.toc")}>
            <details open ref={tocBox}>
              <summary>{t("art.toc")}</summary>
              <ol>
                {toc.map((h) => (
                  <li key={h.id}>
                    <a href={"#" + h.id} aria-current={active === h.id ? "location" : undefined}>
                      {h.text}
                    </a>
                  </li>
                ))}
              </ol>
            </details>
          </nav>
        )}

        <div className="rd-prose" lang={textLang}>
          {own ? (
            <Blocks blocks={blocks} />
          ) : (
            <>
              <p className="rd-label">{t("art.ourSummary")}</p>
              {a.summary && <p className="rd-lead">{a.summary}</p>}
              {a.keyPoints.length > 0 && (
                <>
                  <h2>{t("art.keyPoints")}</h2>
                  <ul>
                    {a.keyPoints.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </>
              )}
              {a.note && <blockquote>{a.note}</blockquote>}
              {a.url && (
                <div className="rd-original">
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="rd-cta">
                    {t("art.open", { publisher: a.publisher ?? "" })} <ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                  <p>{t("art.external", { publisher: a.publisher ?? "" })}</p>
                </div>
              )}
            </>
          )}

          {a.video && (
            <section className="rd-video" aria-labelledby="rd-video">
              <h2 id="rd-video">{t("art.video")}</h2>
              <ContentVideo id={a.video.id} title={a.video.title} channel={a.video.channel} />
            </section>
          )}

          {hasMentions && (
            <section className="rd-mentions" aria-labelledby="rd-mentions">
              <h2 id="rd-mentions">{t("art.mentions")}</h2>
              <ul>
                {unis.map((u) => (
                  <li key={"u" + u.slug}>
                    <Link href={"/university/" + u.slug}>
                      <GraduationCap size={18} aria-hidden="true" />
                      <span>
                        <strong>{u.name}</strong>
                        <small>{t("art.mention.uni")}</small>
                      </span>
                      <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
                {scholarships.map((x) => (
                  <li key={"s" + x.slug}>
                    <Link href={"/scholarships/" + x.slug}>
                      <Award size={18} aria-hidden="true" />
                      <span>
                        <strong>{x.name}</strong>
                        <small>
                          {x.country && <span aria-hidden="true">{flagOf(x.country)} </span>}
                          {t("art.mention.sch")}
                        </small>
                      </span>
                      <ArrowRight size={15} aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {a.sources.length > 0 && (
            <section className="rd-sources" aria-labelledby="rd-sources">
              <h2 id="rd-sources">{t("art.sources")}</h2>
              <ul>
                {a.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer">
                      {s.title} <ArrowUpRight size={13} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {(a.checkedAt || a.updatedAt) && <p className="rd-checked">{t("art.checked", { date: formatDate((a.checkedAt ?? a.updatedAt)!, locale, "long") })}</p>}

          {(prev || next) && (
            <nav className="rd-pn" aria-label={t("art.more")}>
              {prev ? (
                <Link href={"/articles/" + prev.slug} rel="prev">
                  <small>
                    <ArrowLeft size={13} aria-hidden="true" /> {t("art.prev")}
                  </small>
                  <span>{prev.title}</span>
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link href={"/articles/" + next.slug} rel="next" className="is-next">
                  <small>
                    {t("art.next")} <ArrowRight size={13} aria-hidden="true" />
                  </small>
                  <span>{next.title}</span>
                </Link>
              )}
            </nav>
          )}
        </div>
      </div>

      {related.length > 0 && (
        <section className="rd-related" aria-labelledby="rd-related">
          <h2 id="rd-related">{t("art.related")}</h2>
          <ul>
            {related.map((r) => (
              <li key={r.slug}>
                <Link href={"/articles/" + r.slug}>
                  <ScholarshipCover slug={r.slug} image={r.image} className="rd-rel-cover" />
                  <strong>{r.title}</strong>
                  <small>{[r.kind === "own" ? "CollegeStat" : r.publisher, r.kind === "own" ? (r.readingMinutes ? t("art.minutes", { n: r.readingMinutes }) : null) : t("art.summaryTag")].filter(Boolean).join(" · ")}</small>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
