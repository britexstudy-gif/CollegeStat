"use client";
import { Fragment, type ReactNode } from "react";
import { WorkspaceLink as Link } from "@/components/college/workspace-link";

/** A small, safe markdown renderer for assistant replies: paragraphs, headings,
 * bullet / numbered lists, simple tables, **bold**, *italic*, `code` and
 * links. No HTML is ever interpreted. Internal links (our university and
 * scholarship pages) stay in the app; external ones open in a new tab and only
 * http(s) is allowed. */

const LINK = /\[([^\]\n]{1,200})\]\(((?:https?:\/\/|\/)[^)\s]{1,500})\)/g;

export function safeHref(href: string): string | null {
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const u = new URL(href);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

export function citations(text: string) {
  const seen = new Map<string, string>();
  for (const m of text.matchAll(LINK)) {
    const href = safeHref(m[2]);
    if (href && !seen.has(href)) seen.set(href, m[1]);
  }
  return [...seen.entries()].map(([href, label]) => ({ href, label })).slice(0, 8);
}

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]\n]{1,200})\]\(((?:https?:\/\/|\/)[^)\s]{1,500})\)|\*\*([^*\n]+)\*\*|`([^`\n]+)`|(?<![*\w])\*([^*\n]+)\*(?!\w)/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const k = key + "-" + i++;
    if (m[1]) {
      const href = safeHref(m[2]);
      if (!href) out.push(m[1]);
      else if (href.startsWith("/"))
        out.push(
          <Link key={k} href={href} className="asx-link">
            {m[1]}
          </Link>,
        );
      else
        out.push(
          <a key={k} href={href} target="_blank" rel="noreferrer noopener" className="asx-link">
            {m[1]}
          </a>,
        );
    } else if (m[3]) out.push(<strong key={k}>{inline(m[3], k)}</strong>);
    else if (m[4]) out.push(<code key={k}>{m[4]}</code>);
    else if (m[5]) out.push(<em key={k}>{m[5]}</em>);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const BULLET = /^\s*[-*•]\s+/;
const NUMBER = /^\s*\d+[.)]\s+/;
const cells = (row: string) => row.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

export function Markdown({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = "b" + i;
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      blocks.push(
        <p key={key} className="asx-h">
          {inline(heading[2], key)}
        </p>,
      );
      i++;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || "")) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
      blocks.push(
        <div key={key} className="asx-table">
          <table>
            <thead>
              <tr>
                {head.map((h, k) => (
                  <th key={k}>{inline(h, key + k)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, k) => (
                    <td key={k}>{inline(c, key + ri + k)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (BULLET.test(line) || NUMBER.test(line)) {
      const ordered = NUMBER.test(line);
      const items: string[] = [];
      while (i < lines.length && (ordered ? NUMBER : BULLET).test(lines[i])) items.push(lines[i++].replace(ordered ? NUMBER : BULLET, ""));
      const List = ordered ? "ol" : "ul";
      blocks.push(
        <List key={key}>
          {items.map((it, k) => (
            <li key={k}>{inline(it, key + k)}</li>
          ))}
        </List>,
      );
      continue;
    }
    // The first line always belongs to the paragraph, so the loop always advances.
    const para: string[] = [lines[i++]];
    while (i < lines.length && lines[i].trim() && !BULLET.test(lines[i]) && !NUMBER.test(lines[i]) && !/^#{1,4}\s/.test(lines[i]) && !/^\s*\|.*\|\s*$/.test(lines[i]))
      para.push(lines[i++]);
    blocks.push(
      <p key={key}>
        {para.map((l, k) => (
          <Fragment key={k}>
            {k > 0 && <br />}
            {inline(l, key + k)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <>{blocks}</>;
}
