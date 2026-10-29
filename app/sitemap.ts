import type { MetadataRoute } from "next";
import { absoluteURL } from "@/lib/seo";
import { guides } from "@/lib/guides";
import { countries } from "@/lib/domain";
import { usesHostedCatalogue } from "@/lib/catalogue-mode";
import { currentScholarships } from "@/server/scholarship-catalogue";
import { globalCatalogue } from "@/server/global-catalogue";
import { publicDatabase } from "@/server/hosted-catalogue";

type Profile = { slug: string; country_code: string; updated_at?: string | null };
async function universityProfiles(): Promise<Profile[]> {
  if (!usesHostedCatalogue()) return globalCatalogue;
  const rows: Profile[] = [];
  // Supabase caps responses at 1000 rows; the catalogue is well under 50k URLs.
  for (let offset = 0; offset < 50000; offset += 1000) {
    const { data, error } = await publicDatabase()
      .from("universities")
      .select("slug,country_code,updated_at")
      .eq("published", true)
      .order("slug")
      .range(offset, offset + 999);
    if (error) throw new Error("Sitemap catalogue unavailable");
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const profiles = await universityProfiles();
  const page = (path: string, priority: number, changeFrequency: "daily" | "weekly" | "monthly" = "weekly") => ({
    url: absoluteURL(path),
    changeFrequency,
    priority,
  });
  const countryCodes = [...new Set(profiles.map((u) => u.country_code))].filter((c) => countries[c]).sort();
  return [
    page("/", 1, "daily"),
    page("/universities", 0.9, "daily"),
    page("/rankings", 0.8),
    page("/scholarships", 0.8),
    page("/compare", 0.6),
    page("/resources", 0.6, "monthly"),
    page("/research", 0.5, "monthly"),
    ...["methodology", "sources", "about", "support"].map((p) => page("/" + p, 0.3, "monthly")),
    ...["privacy", "terms"].map((p) => page("/" + p, 0.1, "monthly")),
    ...guides.map((g) => page(`/resources/${g.id}`, 0.5, "monthly")),
    ...currentScholarships.filter((s) => s.slug).map((s) => page(`/scholarship/${s.slug}`, 0.6)),
    ...countryCodes.map((c) => page(`/universities?country=${c}`, 0.7)),
    ...profiles.map((u) => ({
      ...page(`/university/${u.slug}`, 0.7),
      ...(u.updated_at ? { lastModified: u.updated_at } : {}),
    })),
  ];
}
