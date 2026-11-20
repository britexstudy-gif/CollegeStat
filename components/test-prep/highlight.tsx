"use client";
import { useCallback, useState, type ReactNode } from "react";
import { Highlighter } from "lucide-react";
import { useT } from "@/components/college/i18n";

/** Select text in a passage, press "Highlight"; tap a highlight to remove it.
 * Works like the highlighter in Bluebook and computer-delivered IELTS. */

type Ranges = Record<string, [number, number][]>;

export function useHighlighter() {
  const [marks, setMarks] = useState<Ranges>({});
  const [pending, setPending] = useState<null | { key: string; start: number; end: number; x: number; y: number }>(null);

  const onMouseUp = useCallback(() => {
    const sel = typeof window !== "undefined" ? window.getSelection() : null;
    if (!sel || sel.isCollapsed || !sel.rangeCount) return setPending(null);
    const range = sel.getRangeAt(0);
    const host = (n: Node | null) => (n instanceof Element ? n : n?.parentElement)?.closest("[data-hl]") as HTMLElement | null;
    const el = host(range.startContainer);
    if (!el || el !== host(range.endContainer)) return setPending(null);
    const pre = document.createRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    const end = start + range.toString().length;
    if (end - start < 1) return setPending(null);
    const rect = range.getBoundingClientRect();
    setPending({ key: el.dataset.hl!, start, end, x: rect.left + rect.width / 2, y: rect.top });
  }, []);

  const add = useCallback(() => {
    if (!pending) return;
    setMarks((m) => ({ ...m, [pending.key]: merge([...(m[pending.key] || []), [pending.start, pending.end]]) }));
    window.getSelection()?.removeAllRanges();
    setPending(null);
  }, [pending]);

  const remove = useCallback((key: string, i: number) => setMarks((m) => ({ ...m, [key]: (m[key] || []).filter((_, j) => j !== i) })), []);
  const clear = useCallback(() => setMarks({}), []);
  return { marks, pending, onMouseUp, add, remove, clear, dismiss: () => setPending(null) };
}

function merge(list: [number, number][]) {
  const s = [...list].sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  for (const r of s) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

/** A block of text that can carry highlights. */
export function Marked({ id, text, marks, onRemove, as: Tag = "p", className, prefix }: { id: string; text: string; marks?: [number, number][]; onRemove: (key: string, i: number) => void; as?: "p" | "div" | "span"; className?: string; prefix?: ReactNode }) {
  const t = useT();
  const parts: ReactNode[] = [];
  let at = 0;
  (marks || []).forEach(([a, b], i) => {
    if (a > at) parts.push(text.slice(at, a));
    parts.push(
      <mark key={i} className="tp-mark" title={t("pr.hl.remove")} onClick={() => onRemove(id, i)}>
        {text.slice(a, b)}
      </mark>,
    );
    at = b;
  });
  if (at < text.length) parts.push(text.slice(at));
  return (
    <Tag className={className}>
      {prefix}
      <span data-hl={id}>{parts}</span>
    </Tag>
  );
}

/** The floating "Highlight" button over a selection. */
export function HighlightButton({ pending, onAdd }: { pending: ReturnType<typeof useHighlighter>["pending"]; onAdd: () => void }) {
  const t = useT();
  if (!pending) return null;
  return (
    <button
      type="button"
      className="tp-hl-btn"
      style={{ left: pending.x, top: Math.max(8, pending.y - 44) }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onAdd}
    >
      <Highlighter size={14} aria-hidden="true" /> {t("pr.hl.add")}
    </button>
  );
}
