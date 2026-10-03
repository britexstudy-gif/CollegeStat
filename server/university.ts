import redirects from "@/data/published/identity-redirects.json";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { publicConfig } from "./public-config";
import { globalCatalogue } from "./global-catalogue";
import { universitySelect } from "@/lib/supabase/catalogue";
import { normalizeUniversity, University } from "@/lib/domain";
import { usesHostedCatalogue } from "@/lib/catalogue-mode";
import { canonicalComparisonIDs } from "@/lib/comparison";
export async function publicUniversities(ids: string[]) {
  const selected = canonicalComparisonIDs(ids);
  if (!selected.length) return [];
  if (!usesHostedCatalogue())
    return selected.flatMap((id) => globalCatalogue.filter((u) => u.id === id));
  const config = publicConfig();
  if (!config.url || !config.anon)
    throw new Error("Public catalogue is not connected");
  const db = createClient(config.url, config.anon, {
    auth: { persistSession: false },
  });
  const { data, error } = await db
    .from("universities")
    .select(universitySelect)
    .eq("published", true)
    .in("id", selected);
  if (error) throw new Error("Public comparison unavailable");
  const rows = (data as unknown as University[]).map(normalizeUniversity);
  return selected.flatMap((id) => rows.filter((u) => u.id === id));
}
// Request-scoped memoization shares one public RLS query between SEO and the page.
export const publicUniversity = cache(async (slug: string) => {
  if (!/^[a-z0-9-]{1,160}$/.test(slug)) return undefined;
  slug =
    Object.values(redirects).find((r) => r.old_slug === slug)?.slug || slug;
  const config = publicConfig();
  if (!usesHostedCatalogue())
    return globalCatalogue.find((u) => u.slug === slug);
  if (!config.url || !config.anon)
    throw new Error("Public catalogue is not connected");
  const db = createClient(config.url, config.anon, {
    auth: { persistSession: false },
  });
  const { data, error } = await db
    .from("universities")
    .select(universitySelect)
    .eq("published", true)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error("Public university unavailable");
  return data ? normalizeUniversity(data as unknown as University) : undefined;
});
