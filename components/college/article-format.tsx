import { Fragment, type ReactNode } from "react";
import type { Article, Block } from "@/lib/articles-data";
import { CATEGORIES } from "@/lib/articles-data";
import { formatDate } from "@/lib/dates";
import type { Translate } from "./i18n";

export const categoryLabel = (id: string, t: Translate) => t(("art.cat." + id) as "art.cat.choosing");
export { CATEGORIES };

export const articleDateText = (a: Article, locale: string) => {
  if (a.dateLabel) return a.dateLabel;
  if (!a.publishedAt) return null;
  return formatDate(a.publishedAt, locale);
};

const safeHref = (url: string) => (/^(https?:\/\/|\/|#|mailto:)/i.test(url) ? url : "#");

/** **bold**, *italic*, `code` and [text](url), rendered as elements (never raw HTML). */
function Inline({ text }: { text: string }): ReactNode {
  const parts = text.split(/(\[[^\]]+\]\([^)\s]+\)|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => {
        let m;
        if ((m = p.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/))) {
          const external = /^https?:/i.test(m[2]);
          return (
            <a key={i} href={safeHref(m[2])} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
              {m[1]}
            </a>
          );
        }
        if ((m = p.match(/^\*\*([^*]+)\*\*$/))) return <strong key={i}>{m[1]}</strong>;
        if ((m = p.match(/^\*([^*]+)\*$/))) return <em key={i}>{m[1]}</em>;
        if ((m = p.match(/^`([^`]+)`$/))) return <code key={i}>{m[1]}</code>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === "h2") return <h2 key={i} id={b.id}>{b.text}</h2>;
        if (b.type === "h3") return <h3 key={i} id={b.id}>{b.text}</h3>;
        if (b.type === "quote") return <blockquote key={i}><Inline text={b.text} /></blockquote>;
        if (b.type === "p") return <p key={i}><Inline text={b.text} /></p>;
        const list = (b as Extract<Block, { type: "ul" | "ol" }>).items;
        // "- [ ] task" lines become a to-do list.
        const todo = b.type === "ul" && list.every((it) => /^\[[ xX]\]\s/.test(it));
        const items = list.map((it, j) => (
          <li key={j}>
            {todo && <span className="md-box" aria-hidden="true" />}
            <Inline text={todo ? it.replace(/^\[[ xX]\]\s/, "") : it} />
          </li>
        ));
        return b.type === "ul" ? <ul key={i} className={todo ? "md-todo" : undefined}>{items}</ul> : <ol key={i}>{items}</ol>;
      })}
    </>
  );
}
