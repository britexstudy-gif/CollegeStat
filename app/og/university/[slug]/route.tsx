import { countryName } from "@/lib/domain";
import { profileKeyFacts, type KeyFactId } from "@/lib/profile-key-facts";
import { inlineLogo, ogCardResponse } from "@/server/og-card";
import { publicUniversityForPage } from "@/server/university";

const CACHE = "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800";
const LABEL: Record<KeyFactId, string> = { tuition: "Tuition", english: "English minimum", deadline: "Next deadline", rank: "World ranking", admission: "Acceptance rate", sat: "Admitted SAT" };
const ORDER: KeyFactId[] = ["tuition", "english", "deadline", "rank", "admission", "sat"];

/** 1200x630 PNG share card for /university/<slug>. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let u;
  try {
    u = await publicUniversityForPage(slug.replace(/\.png$/, ""));
  } catch {
    return new Response("Unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!u) return new Response("Not found", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });
  const byId = new Map(profileKeyFacts(u).map((f) => [f.id, f]));
  const facts = ORDER.flatMap((id) => (byId.has(id) ? [{ label: LABEL[id], value: byId.get(id)!.value }] : [])).slice(0, 3);
  const logo = await inlineLogo(u.logo_url);
  return ogCardResponse(
    { eyebrow: countryName(u.country_code), title: u.name, subtitle: u.city ?? undefined, facts, logo, initial: (u.short_name || u.name).charAt(0).toUpperCase() },
    CACHE,
  );
}
