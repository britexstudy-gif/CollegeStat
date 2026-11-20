import { publicReadCache } from "@/server/public-read-cache";
import { publicUniversity } from "@/server/university";
import { universityFactsMarkdown, universityFactsView } from "@/lib/seo/university-facts";

// Anonymous published facts only; same short-lived cache as the other public reads.
const viewCache = publicReadCache<ReturnType<typeof universityFactsView> | null>(64, 300000);
const CACHE = "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const markdown = new URL(request.url).searchParams.get("format") === "md";
  try {
    const view = await viewCache(slug, async () => {
      const u = await publicUniversity(slug);
      return u ? universityFactsView(u) : null;
    });
    if (!view)
      return Response.json({ error: "University not found" }, { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
    const headers = { "Cache-Control": CACHE, Vary: "Accept", "Access-Control-Allow-Origin": "*" };
    if (markdown)
      return new Response(universityFactsMarkdown(view), { headers: { ...headers, "Content-Type": "text/markdown; charset=utf-8" } });
    return Response.json(view, { headers });
  } catch {
    return Response.json({ error: "University data is temporarily unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
