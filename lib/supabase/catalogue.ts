import { getSupabase } from "./client";
import { normalizeUniversity, University, Scholarship } from "../domain";
import { Filters } from "../research";
import { usesHostedCatalogue } from "../catalogue-mode";
// Authentication and public data have independent activation. Connecting an empty
// Supabase project must not remove the published catalogue from the application.
function catalogueClient() {
  if (!usesHostedCatalogue()) return null;
  const client = getSupabase();
  if (!client)
    throw new Error("The university catalogue is not connected yet.");
  return client;
}
export const universitySelect =
  "*,data_points(*,data_sources(*)),costs(*,data_sources(*)),admissions(*,data_sources(*)),university_programs(*,programs(*),data_sources(*)),ranking_entries(*,data_sources(*),ranking_editions(*,ranking_providers(*))),campuses(*),departments(*,data_sources(*)),professors(*,data_sources(*)),research(*,data_sources(*)),deadlines(*,data_sources(*)),requirements(*,data_sources(*)),financial_aid(*,data_sources(*)),media(*,data_sources(*)),university_scholarships(scholarships(*,data_sources(*)))";
export async function publicRequest<T>(query: string): Promise<T> {
  const r = await fetch("/api/catalog?" + query);
  if (!r.ok) throw new Error("Catalogue unavailable");
  return r.json() as Promise<T>;
}
export type Catalogue = {
  mode: "supabase" | "reference";
  universities: University[];
  scholarships: Scholarship[];
};
let reference: Promise<Catalogue> | undefined;
async function references() {
  reference ??= fetch("/api/catalog")
    .then(async (r) => {
      if (!r.ok) throw new Error("Catalogue unavailable");
      return r.json() as Promise<Catalogue>;
    })
    .catch((e) => {
      reference = undefined;
      throw e;
    });
  const result = await reference;
  reference = undefined;
  return result;
}
export async function fetchCatalogue(): Promise<Catalogue> {
  return references();
}

export async function searchCatalogue(query: string) {
  return publicRequest<University[]>('mode=search&q=' + encodeURIComponent(query));
}

export async function universitiesByIds(ids: string[]) {
  if (!ids.length) return [];
  const client = catalogueClient();
  if (!client)
    return publicRequest<University[]>(
      "ids=" + encodeURIComponent(ids.join(",")),
    );
  const { data, error } = await client
    .from("universities")
    .select(universitySelect)
    .in("id", ids.slice(0, 24));
  if (error) throw error;
  return (data as unknown as University[]).map(normalizeUniversity);
}
export async function universityBySlug(slug: string) {
  const client = catalogueClient();
  if (!client)
    return (
      (await publicRequest<University | null>(
        "slug=" + encodeURIComponent(slug),
      )) ?? undefined
    );
  const { data, error } = await client
    .from("universities")
    .select(universitySelect)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeUniversity(data as unknown as University) : undefined;
}
export type ExplorerResult = {
  suggestions?: { name: string; slug: string }[];
  universities: University[];
  total: number;
  page?: number;
  medianTuition: number | null;
  medianAdmission: number | null;
  countries: number;
};
export async function exploreUniversities(f: Filters): Promise<ExplorerResult> {
  return publicRequest<ExplorerResult>('mode=explore&' + new URLSearchParams(Object.entries(f).filter(([,v]) => v !== undefined).map(([k,v]) => [k,String(v)])).toString());
}
