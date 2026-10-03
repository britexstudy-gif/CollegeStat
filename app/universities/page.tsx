import Directory from "@/pages-ui/directory";
import { exploreCatalogue } from "@/server/explorer";
import { hostedExplore } from '@/server/hosted-catalogue';
import { readFilters } from '@/lib/research';
export default async function UniversitiesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach(v => query.append(key, v));
    else if (value !== undefined) query.set(key, value);
  }
  return <Directory initialQuery={query.toString()} initialResult={process.env.NEXT_PUBLIC_CATALOGUE_SOURCE === "supabase" ? await hostedExplore(readFilters(query)) : exploreCatalogue(query)} />;
}
