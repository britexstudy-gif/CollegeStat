import type { Metadata } from "next";
import Directory from "@/pages-ui/directory";
import { JsonLd } from "@/components/seo/json-ld";
import { countryName } from "@/lib/domain";
import { buildBreadcrumbJsonLd, buildItemListJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { hostedExplore } from "@/server/hosted-catalogue";
import { skipEdgeCache } from "@/server/edge-cache";
import { readFilters, parseResearchQuery, filterURL } from "@/lib/research";
import { redirect } from "next/navigation";
import type { ExplorerResult } from "@/lib/supabase/catalogue";
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const params = await searchParams;
  const filters = Object.keys(params).filter((k) => params[k] !== undefined && params[k] !== "");
  const country = typeof params.country === "string" ? params.country.toUpperCase() : "";
  const onlyCountry = filters.length === 1 && /^[A-Z]{2}$/.test(country) && countryName(country) !== country;
  if (onlyCountry)
    return pageMetadata({
      title: `Universities in ${countryName(country)}`,
      description: `Browse universities in ${countryName(country)} with sourced rankings, tuition, admission figures and requirements.`,
      path: "/universities?country=" + country,
    });
  return pageMetadata({
    title: "Find a university: search by country, field and cost",
    description:
      "Search about 14,000 universities by country, subject, degree, tuition and entry requirements. Every profile links to its sources.",
    path: "/universities",
    // Filtered result lists are thin duplicates; keep them out of the index but let links be followed.
    noindex: filters.length > 0,
  });
}
export default async function UniversitiesPage({
  searchParams,
  routeBase = "/universities",
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
  routeBase?: string;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((v) => query.append(key, v));
    else if (value !== undefined) query.set(key, value);
  }
  // Keep the hero's native form useful while its client code is still loading.
  if (query.get("interpret") === "1") {
    const parsed = parseResearchQuery((query.get("q") || "").slice(0, 200));
    const explicit = readFilters(query);
    const interpreted = new URLSearchParams(filterURL({
      ...parsed.filters,
      ...(explicit.country ? { country: explicit.country } : {}),
      ...(explicit.type ? { type: explicit.type } : {}),
    }));
    if (parsed.unparsed) interpreted.set("unresolved", parsed.unparsed);
    redirect(routeBase + (interpreted.size ? "?" + interpreted : ""));
  }
  let initialResult: ExplorerResult | undefined;
  let initialError = "";
  try {
    initialResult =
      process.env.NEXT_PUBLIC_CATALOGUE_SOURCE === "supabase"
        ? await hostedExplore(readFilters(query))
        : await (await import("@/server/explorer")).exploreCatalogue(query);
  } catch {
    // A provider timeout must leave the search and its selected filters usable.
    // The retry state is served to this visitor only, never edge-cached.
    skipEdgeCache();
    initialError =
      "University results could not be loaded. Your filters are kept. Please retry.";
  }
  return (
    <>
      <JsonLd
        data={[
          buildBreadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Universities", path: "/universities" }]),
          buildItemListJsonLd(
            "Universities",
            (initialResult?.universities ?? []).map((u) => ({ name: u.name, path: "/university/" + u.slug })),
          ),
        ]}
      />
      <Directory
        initialQuery={query.toString()}
        initialResult={initialResult}
        initialError={initialError}
      />
    </>
  );
}

