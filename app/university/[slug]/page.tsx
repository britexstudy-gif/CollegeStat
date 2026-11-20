import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { SimilarUniversities } from "@/components/college/similar-universities";
import UniversityPage from "@/pages-ui/university";
import redirects from "@/data/published/identity-redirects.json";
import { publicUniversityForPage } from "@/server/university";
import { splitProfile } from "@/server/profile-split";
import { profileExtras } from "@/server/profile-extras";
import { profileMore } from "@/server/profile-more";
import { countryName } from "@/lib/domain";
import { JsonLd } from "@/components/seo/json-ld";
import { buildBreadcrumbJsonLd, buildFaqJsonLd, buildUniversityJsonLd } from "@/lib/seo/json-ld";
import { universityFaqEnglish } from "@/lib/university-faq";
import { universityDescription, universityMetadata } from "@/lib/seo/metadata";
type Props = { params: Promise<{ slug: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>>; routeBase?: string };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const u = await publicUniversityForPage((await params).slug);
  if (!u) return { title: "University not found", robots: { index: false } };
  return universityMetadata(u);
}
export default async function Page({ params, searchParams, routeBase = "/university" }: Props) {
  const rawSlug = (await params).slug;
  // Canonical handling: old_slug aliases (see identity-redirects.json, also
  // rewritten in /api/catalog and server/university.ts) permanently redirect
  // to the canonical slug instead of serving under the old URL.
  const canonical =
    Object.values(redirects).find((r) => r.old_slug === rawSlug)?.slug ||
    rawSlug;
  if (canonical !== rawSlug) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams ? await searchParams : {})) {
      if (Array.isArray(value)) value.forEach(item => query.append(key, item));
      else if (value !== undefined) query.set(key, value);
    }
    permanentRedirect(routeBase + "/" + canonical + (query.size ? "?" + query : ""));
  }
  const u = await publicUniversityForPage(rawSlug);
  if (!u) notFound();
  const place = [u.city, countryName(u.country_code)].filter(Boolean).join(", ");
  const schema = [
    buildUniversityJsonLd(u, universityDescription(u)),
    buildBreadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Universities", path: "/universities" },
      { name: u.name + (place ? " — " + place : ""), path: "/university/" + u.slug },
    ]),
  ];
  const faq = universityFaqEnglish(u);
  if (faq.length) schema.push(buildFaqJsonLd(faq));
  return (
    <>
      <JsonLd data={schema} />
      {/* The page ships the lite record; programme, research-metric and paper
          lists load when a view that shows them opens (lib/profile-defer.ts). */}
      <UniversityPage key={u.slug} slug={u.slug} initialUniversity={splitProfile(u).lite} extras={{ ...profileExtras(u.id), ...(await profileMore(u)) }} />
      <Suspense fallback={null}>
        <SimilarUniversities university={u} />
      </Suspense>
    </>
  );
}
