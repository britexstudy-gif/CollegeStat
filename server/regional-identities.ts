import list from "@/data/generated/catalogue/list.json";
import type { University as CatalogueRow } from "@/lib/domain";
// List-weight rows precomputed by scripts/build-catalogue.ts.
const globalCatalogue = list as CatalogueRow[];
import records from "@/data/published/regional-rankings.json";
import type { UniversityIdentity } from "@/components/college/primitives";

export function regionalIdentities(): Record<string, UniversityIdentity> {
  return Object.fromEntries(records.flatMap(record => {
    const matches = globalCatalogue.filter(u => {
      try { const host = new URL(u.website || "").hostname; return host === record.domain || host.endsWith("." + record.domain); }
      catch { return false; }
    });
    const exact = matches.filter(u => u.name.toLowerCase() === record.name.toLowerCase());
    const u = matches.length === 1 ? matches[0] : exact.length === 1 ? exact[0] : null;
    return u ? [[record.domain, { name:u.name, slug:u.slug, website:u.website, logo_url:u.logo_url, website_icon_url:u.website_icon_url, short_name:u.short_name, brand_color:u.brand_color }]] : [];
  }));
}
