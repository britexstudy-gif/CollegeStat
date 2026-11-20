import { getArticle } from "@/lib/articles-load";
import { ogCardResponse } from "@/server/og-card";

const CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";

/** 1200x630 PNG share card for /articles/<slug>. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const a = getArticle((await params).slug.replace(/\.png$/, ""));
  if (!a) return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
  const facts = [
    ...(a.readingMinutes ? [{ label: "Reading time", value: a.readingMinutes + " min" }] : []),
    ...(a.publisher && a.kind !== "own" ? [{ label: "Source", value: a.publisher }] : []),
  ];
  return ogCardResponse({ eyebrow: "Guide", title: a.title, facts, initial: "C" }, CACHE);
}
