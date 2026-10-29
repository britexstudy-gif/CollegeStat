import redirects from "@/data/published/identity-redirects.json";
import { bundledCatalogue } from "@/server/bundled";
import { rankingTableFor } from "@/server/ranking-rows";
import { countryName } from "@/lib/domain";
import {
  matchesSearch,
  normalizeSearch,
  searchRelevance,
} from "@/lib/search-text";
import {
  filterUniversities,
  parseResearchQuery,
} from "@/lib/research";
import { universityRanks } from "@/lib/ranking-highlights";
import { usesHostedCatalogue } from '@/lib/catalogue-mode';
import { hostedCatalogue, hostedExplore, hostedRankingProfiles, hostedSearch, hostedUniversities } from '@/server/hosted-catalogue';
import { publicUniversity } from '@/server/university';
import { readFilters } from '@/lib/research';
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const respond = (data: unknown) =>
    Response.json(data, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  if (p.get("mode") === "ranking-table") {
    if (!usesHostedCatalogue())
      return respond((await bundledCatalogue()).rankingTable(p));
    try {
      return respond(rankingTableFor(p, await hostedRankingProfiles()));
    } catch {
      return Response.json({error:'Rankings could not be loaded. Please retry.'},{status:503,headers:{'Cache-Control':'no-store'}});
    }
  }
  const alias = Object.values(redirects).find(
    (r) => r.old_slug === p.get("slug"),
  );
  if (alias) p.set("slug", alias.slug);
  if (p.has("ids"))
    p.set(
      "ids",
      (p.get("ids") || "")
        .split(",")
        .map(
          (id) => (redirects as Record<string, { id: string }>)[id]?.id || id,
        )
        .join(","),
    );
  if (usesHostedCatalogue()) {
    try {
      if(p.has('slug')) return respond(await publicUniversity(p.get('slug') || '') || null);
      if(p.has('ids')) return respond(await hostedUniversities((p.get('ids') || '').split(',')));
      if(p.get('mode')==='explore') return respond(await hostedExplore(readFilters(p)));
      if(p.get('mode')==='search') return respond(await hostedSearch(p.get('q') || ''));
      if(p.get('mode')==='rankings') return respond(await hostedRankingProfiles());
      return respond(await hostedCatalogue());
    } catch {
      return Response.json({error:'The catalogue could not be loaded. Please retry.'},{status:503,headers:{'Cache-Control':'no-store'}});
    }
  }
  const { globalCatalogue, featuredCatalogue, referenceScholarships, exploreCatalogue } =
    await bundledCatalogue();
  if (p.has("slug"))
    return respond(
      globalCatalogue.find((u) => u.slug === p.get("slug")) || null,
    );
  if (p.has("ids"))
    return respond(
      globalCatalogue.filter((u) =>
        (p.get("ids") || "").split(",").slice(0, 100).includes(u.id),
      ),
    );
  if (p.get("mode") === "rankings")
    return respond(
      globalCatalogue
        .filter(
          (u) =>
            universityRanks(u).length ||
            u.imported_records?.some((r) => r.source === "leiden"),
        )
        .map((u) => ({
          id: u.id,
          name: u.name,
          slug: u.slug,
          short_name: u.short_name,
          country_code: u.country_code,
          city: u.city,
          website: u.website,
          logo_url: u.logo_url,
          rankings: u.rankings,
          imported_records: u.imported_records?.filter(
            (r) => r.source === "leiden",
          ),
        })),
    );
  if (p.get("mode") === "search") {
    const q = normalizeSearch((p.get("q") || "").slice(0, 200));
    const parsed = parseResearchQuery((p.get("q") || "").slice(0, 200));
    if (parsed.recognized)
      return respond(
        filterUniversities(globalCatalogue, parsed.filters)
          .sort(
            (a, b) =>
              searchRelevance(parsed.filters.q, b.name, b.aliases) -
              searchRelevance(parsed.filters.q, a.name, a.aliases),
          )
          .slice(0, 8),
      );
    return respond(
      (q ? globalCatalogue : featuredCatalogue)
        .filter((u) =>
          matchesSearch(q, [
            u.name,
            u.short_name,
            u.city,
            countryName(u.country_code),
            ...(u.aliases || []),
            ...(u.reported_programs || []).map((p) => p.name),
            ...u.university_programs.map(
              (p) => p.programs.name + " " + p.programs.subject,
            ),
          ]),
        )
        .sort(
          (a, b) =>
            searchRelevance(q, b.name, [
              b.short_name || "",
              ...(b.aliases || []),
            ]) -
            searchRelevance(q, a.name, [
              a.short_name || "",
              ...(a.aliases || []),
            ]),
        )
        .slice(0, 8),
    );
  }
  if (p.get("mode") === "explore") return respond(exploreCatalogue(p));
  return respond({
    mode: "reference",
    universities: featuredCatalogue,
    scholarships: referenceScholarships,
    total: globalCatalogue.length,
    countries: new Set(globalCatalogue.map((u) => u.country_code)).size,
  });
}
