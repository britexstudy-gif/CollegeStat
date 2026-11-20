"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exploreUniversities, type ExplorerResult } from "@/lib/supabase/catalogue";
import { filterURL, readFilters } from "@/lib/research";
import type { University } from "@/lib/domain";
import { useT } from "./i18n";

/** Pages the server returns per request (server/explorer.ts, explore_universities RPC). */
export const PAGE_SIZE = 24;
/** Pages that load by themselves while scrolling; after that the button asks, so the footer stays reachable. */
const AUTO_PAGES = 4;

/** Appends the next result pages under the server-rendered first page. Resets when the filters change. */
export function useMoreResults(filterKey: string, result: ExplorerResult | null) {
  const [state, setState] = useState<{ key: string; base: number; rows: University[] }>({ key: "", base: 0, rows: [] });
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const base = result?.page ?? 1;
  const own = state.key === filterKey && state.base === base ? state.rows : [];
  useEffect(() => {
    controller.current?.abort();
    setLoading(false);
    setFailed(false);
  }, [filterKey, base]);
  const total = result?.total ?? 0;
  const shown = (result?.universities.length ?? 0) + own.length;
  const next = base + Math.ceil(own.length / PAGE_SIZE) + 1;
  const hasMore = !!result && (base - 1) * PAGE_SIZE + shown < total;
  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    const c = new AbortController();
    controller.current = c;
    setLoading(true);
    setFailed(false);
    exploreUniversities({ ...readFilters(new URLSearchParams(filterKey)), page: next }, c.signal)
      .then((r) => {
        if (c.signal.aborted) return;
        setState((prev) => {
          const kept = prev.key === filterKey && prev.base === base ? prev.rows : [];
          const seen = new Set([...(result?.universities ?? []), ...kept].map((u) => u.id));
          return { key: filterKey, base, rows: [...kept, ...r.universities.filter((u) => !seen.has(u.id))] };
        });
      })
      .catch(() => !c.signal.aborted && setFailed(true))
      .finally(() => !c.signal.aborted && setLoading(false));
  }, [loading, hasMore, filterKey, next, base, result]);
  return { rows: own, shown, total, hasMore, loading, failed, loadMore, next, auto: own.length < AUTO_PAGES * PAGE_SIZE };
}

/** "Showing 48 of 1,203" + the next page as a real link (crawlable), loading in place on click or on scroll. */
export function MoreResults({ more, href }: { more: ReturnType<typeof useMoreResults>; href: string }) {
  const t = useT();
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasMore, auto, failed, loading, loadMore } = more;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore || !auto || failed || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && loadMore(), { rootMargin: "700px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, auto, failed, loadMore]);
  if (!more.total) return null;
  const left = Math.min(PAGE_SIZE, more.total - more.shown);
  return (
    <div ref={sentinel} className="mt-8 flex flex-col items-center gap-3 text-sm">
      <p className="text-muted-foreground" aria-live="polite">
        {t("u2.list.shown", { shown: more.shown.toLocaleString("en"), total: more.total.toLocaleString("en") })}
      </p>
      {failed && <p role="alert" className="text-muted-foreground">{t("u2.list.failed")}</p>}
      {hasMore && (
        <Button asChild variant="outline" className="min-w-48 rounded-full" aria-busy={loading}>
          <a
            href={href}
            onClick={(e) => {
              e.preventDefault();
              loadMore();
            }}
          >
            {loading && <Loader2 className="animate-spin" />}
            {failed ? t("uni.list.retry") : t("u2.list.more", { n: left })}
          </a>
        </Button>
      )}
    </div>
  );
}
export const nextPageHref = (filterKey: string, page: number, base: string) => base + "?" + filterURL({ ...readFilters(new URLSearchParams(filterKey)), page });
