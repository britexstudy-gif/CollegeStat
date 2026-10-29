import Directory from "@/pages-ui/directory";
import { exploreCatalogue } from "@/server/explorer";
import { hostedExplore } from '@/server/hosted-catalogue';
import { readFilters } from '@/lib/research';
import { countries } from "@/lib/domain";
import { pageMetadata } from "@/lib/seo";
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
// A country-only filter is a crawlable landing page; every other filter
// combination canonicalises to the full directory.
export async function generateMetadata({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const keys = Object.keys(params).filter(k => params[k] !== undefined && params[k] !== "");
  const code = typeof params.country === "string" ? params.country.toUpperCase() : "";
  const country = countries[code];
  if (country && keys.length === 1)
    return pageMetadata({
      title: `Universities in ${country}`,
      description: `Browse universities in ${country} with sourced tuition, acceptance rates, rankings, programs, and scholarships for international students.`,
      path: `/universities?country=${code}`,
    });
  return pageMetadata({
    title: "Browse universities worldwide",
    description: "Search and filter 8,900+ universities in 175 countries by country, field, tuition, acceptance rate, English test scores, and scholarships.",
    path: "/universities",
  });
}
export default async function UniversitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach(v => query.append(key, v));
    else if (value !== undefined) query.set(key, value);
  }
  return <Directory initialQuery={query.toString()} initialResult={process.env.NEXT_PUBLIC_CATALOGUE_SOURCE === "supabase" ? await hostedExplore(readFilters(query)) : exploreCatalogue(query)} />;
}
