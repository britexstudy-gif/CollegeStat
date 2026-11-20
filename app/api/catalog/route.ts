import redirects from "@/data/published/identity-redirects.json";
import directoryManifest from "@/data/published/directory-manifest.json";
import { countryName } from "@/lib/domain";
import {
  matchesSearch,
  normalizeSearch,
  searchRelevance,
} from "@/lib/search-text";
import { parseResearchQuery } from "@/lib/research";
import { bundledFilterSearch } from "@/server/bundled-search";
import { attachAutoLogos } from "@/server/auto-logos";
import { splitProfile } from "@/server/profile-split";
import { universityRanks } from "@/lib/ranking-highlights";
import { usesHostedCatalogue } from "@/lib/catalogue-mode";
import {
  hostedCatalogue,
  hostedExplore,
  hostedRankingProfiles,
  hostedSearch,
  hostedUniversities,
  hostedUniversityIdentities,
} from "@/server/hosted-catalogue";
import { publicUniversity, withReviewedMedia } from "@/server/university";
import { readFilters } from "@/lib/research";
import {
  hostedRegionalRecords,
  hostedRegionalEditions,
  createRegionalReadContext,
} from "@/server/hosted-regional";
import {
  regionalEditions,
  resolveRegionalScope,
} from "@/lib/regional-rankings";
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const respond = (data: unknown, filtered = false) =>
    Response.json(attachAutoLogos(data), {
      headers: {
        "Cache-Control": filtered
          ? "public, max-age=60"
          : "public, max-age=300",
        Vary: "Accept",
      },
    });
  // Filtered views (search/explore/rankings/ids/slug) change per query string,
  // so they use a short 60s cache plus Vary: Accept; only the unfiltered
  // reference payload keeps the longer 300s entry.
  if (p.get("mode") === "ranking-table") {
    try {
      const { rankingTable } = await import("@/server/ranking-table");
      if (
        usesHostedCatalogue() &&
        p.get("scope") !== "regional" &&
        p.get("provider") === "leiden"
      ) {
        const { hostedLeidenProfiles } =
          await import("@/server/leiden-ranking-profiles");
        return respond(
          await rankingTable(
            p,
            undefined,
            undefined,
            await hostedLeidenProfiles(request.signal),
          ),
          true,
        );
      }
      if (usesHostedCatalogue() && p.get("scope") === "regional") {
        const regionalRead = createRegionalReadContext(request.signal);
        const hostedEditions = await hostedRegionalEditions(regionalRead);
        const available = hostedEditions.length
          ? hostedEditions
          : regionalEditions;
        const scope = resolveRegionalScope(p.get("edition"), available);
        const regional = await hostedRegionalRecords(
          scope,
          hostedEditions,
          regionalRead,
        );
        return respond(await rankingTable(p, regional, available), true);
      }
      return respond(await rankingTable(p), true);
    } catch {
      return Response.json(
        { error: "Rankings could not be loaded. Please retry." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  }
  const SLUG_RE = /^[a-z0-9-]+$/;
  if (p.has("slug")) {
    const rawSlug = (p.get("slug") || "").trim();
    if (!rawSlug || rawSlug.length > 160 || !SLUG_RE.test(rawSlug)) {
      // Unknown alias shapes never match; reject instead of scanning.
      if (!Object.values(redirects).some((r) => r.old_slug === rawSlug))
        return Response.json(
          { error: "Invalid university slug" },
          { status: 400, headers: { "Cache-Control": "no-store" } },
        );
    }
    const alias = Object.values(redirects).find((r) => r.old_slug === rawSlug);
    p.set("slug", alias ? alias.slug : rawSlug);
  }
  // Long lists left out of the profile page; the profile asks for them when
  // the Programmes, Research, Rankings or Sources view opens.
  if (p.get("part") === "heavy" && p.has("slug")) {
    try {
      const full = await publicUniversity(p.get("slug") || "");
      if (!full)
        return Response.json(
          { error: "University not found" },
          { status: 404, headers: { "Cache-Control": "no-store" } },
        );
      return respond(splitProfile(full).heavy, true);
    } catch {
      return Response.json(
        { error: "The catalogue could not be loaded. Please retry." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  }
  if (p.has("ids")) {
    const ids = (p.get("ids") || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, 100)
      .map((id) => (redirects as Record<string, { id: string }>)[id]?.id || id);
    p.set("ids", ids.join(","));
  }
  if (usesHostedCatalogue()) {
    try {
      if (p.has("slug"))
        return respond(
          (await publicUniversity(p.get("slug") || "")) || null,
          true,
        );
      if (p.has("ids")) {
        const ids = (p.get("ids") || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 100);
        return respond(
          p.get("mode") === "identity"
            ? await hostedUniversityIdentities(ids)
            : // Full rows carry the reviewed history/identity the profile shows.
              await Promise.all((await hostedUniversities(ids)).map(withReviewedMedia)),
          true,
        );
      }
      if (p.get("mode") === "explore")
        return respond(await hostedExplore(readFilters(p)), true);
      if (p.get("mode") === "search")
        return respond(await hostedSearch(p.get("q") || ""), true);
      if (p.get("mode") === "rankings")
        return respond(await hostedRankingProfiles(), true);
      return respond(await hostedCatalogue());
    } catch {
      return Response.json(
        { error: "The catalogue could not be loaded. Please retry." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  }
  if (
    !p.has("slug") &&
    !p.has("ids") &&
    !["rankings", "search", "explore"].includes(p.get("mode") || "")
  ) {
    const { landingCatalogue } = await import("@/server/catalogue-store");
    const { universities, scholarships } = await landingCatalogue();
    return respond({
      mode: "reference",
      universities,
      scholarships,
      total: directoryManifest.catalogue_total,
      countries: directoryManifest.countries,
    });
  }
  const store = await import("@/server/catalogue-store");
  if (p.has("slug"))
    return respond(
      (await publicUniversity(p.get("slug") || "")) || null,
      true,
    );
  if (p.has("ids")) {
    const identityOnly = p.get("mode") === "identity";
    const selected = new Set(
      (p.get("ids") || "").split(",").slice(0, identityOnly ? 24 : 100),
    );
    const rows = await store.universitiesByIds([...selected]);
    return respond(
      identityOnly
        ? rows.map((u) => ({
            id: u.id,
            name: u.name,
            slug: u.slug,
            short_name: u.short_name,
            website: u.website,
            logo_url: u.logo_url,
            logo_source_url: u.logo_source_url,
            logo_usage_notes: u.logo_usage_notes,
            brand_color: u.brand_color,
            media: u.media,
          }))
        : await Promise.all(rows.map(withReviewedMedia)),
      true,
    );
  }
  if (p.get("mode") === "rankings")
    return respond(
      (await store.catalogueList())
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
      true,
    );
  if (p.get("mode") === "search") {
    const q = normalizeSearch((p.get("q") || "").slice(0, 200));
    const parsed = parseResearchQuery((p.get("q") || "").slice(0, 200));
    if (parsed.recognized)
      return respond(await bundledFilterSearch(parsed.filters), true);
    const globalCatalogue = await store.catalogueList();
    return respond(
      (q ? globalCatalogue : await store.referenceRows())
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
      true,
    );
  }
  if (p.get("mode") === "explore") {
    const { exploreCatalogue } = await import("@/server/explorer");
    return respond(await exploreCatalogue(p), true);
  }
  return Response.json(
    { error: "Unsupported catalogue query" },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}
