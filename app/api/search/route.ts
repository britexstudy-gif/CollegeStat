import { attachAutoLogos } from "@/server/auto-logos";
import { runSearch, searchEngine } from "@/server/search-index";
import type { SearchResponse } from "@/lib/search/types";

/** GET /api/search?q=…&limit=20&offset=0
 * Smart search over the static index: parsed filters (for removable chips),
 * universities with the reason they matched, scholarships and articles. */
export async function GET(request: Request) {
  const started = performance.now();
  const p = new URL(request.url).searchParams;
  const q = (p.get("q") || "").trim().slice(0, 200);
  const int = (key: string, fallback: number, max: number) => {
    const n = Number(p.get(key));
    return Number.isFinite(n) && n >= 0 ? Math.min(Math.floor(n), max) : fallback;
  };
  if (!q) {
    const empty: SearchResponse = { q, filters: [], ignored: [], universities: [], total: 0, scholarships: [], articles: [], tookMs: 0 };
    return Response.json(empty, { headers: { "Cache-Control": "public, max-age=300" } });
  }
  try {
    const engine = await searchEngine();
    const result = runSearch(engine, q, {
      limit: int("limit", 20, 100) || 20,
      offset: int("offset", 0, 5000),
      scholarships: int("scholarships", 4, 10),
      articles: int("articles", 3, 10),
    });
    const body = attachAutoLogos({ ...result, tookMs: Math.round(performance.now() - started) });
    return Response.json(body, { headers: { "Cache-Control": "public, max-age=120" } });
  } catch {
    return Response.json({ error: "Search is unavailable. Please retry." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
