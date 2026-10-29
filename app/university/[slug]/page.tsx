import type { Metadata } from "next";
import { notFound } from "next/navigation";
import UniversityPage from "@/pages-ui/university";
import { publicUniversity } from "@/server/university";
import { countries, type University } from "@/lib/domain";
import { absoluteURL, jsonLD, pageMetadata } from "@/lib/seo";
type Props = { params: Promise<{ slug: string }> };
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
function seoFacts(u: University) {
  const place = [u.city, countries[u.country_code] || u.country_code].filter(Boolean).join(", ");
  const admission = u.admissions.find((a) => a.acceptance_rate != null && !a.program_id);
  const tuition =
    u.costs.find((c) => c.category === "tuition" && c.student_category === "international") ||
    u.costs.find((c) => c.category === "tuition" && c.student_category === "out_of_state");
  const facts = [
    admission ? `${Math.round(admission.acceptance_rate!)}% acceptance rate${admission.year ? ` (${admission.year})` : ""}` : "",
    tuition ? `${money(tuition.amount, tuition.currency)} tuition${tuition.year ? ` (${tuition.year})` : ""}` : "",
  ].filter(Boolean);
  return { place, facts };
}
const campusImage = (u: University) => u.media.find((m) => m.kind === "campus") || null;
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const u = await publicUniversity((await params).slug);
  if (!u) return { title: "University not found", robots: { index: false } };
  const { place, facts } = seoFacts(u);
  const description = [
    `${u.name}${place ? ` in ${place}` : ""}`,
    facts.length ? `: ${facts.join(", ")}.` : ".",
    " Sourced admissions, tuition, rankings, programs, and scholarships on CollegeStat.",
  ].join("");
  const image = campusImage(u);
  return pageMetadata({
    title: `${u.name}: admissions, tuition and rankings`,
    description,
    path: `/university/${u.slug}`,
    image: image ? { url: image.url, alt: image.alt } : null,
  });
}
export default async function Page({ params }: Props) {
  const u = await publicUniversity((await params).slug);
  if (!u) notFound();
  const url = absoluteURL(`/university/${u.slug}`);
  const image = campusImage(u);
  const sameAs = [u.website, ...(u.social_links || []).map((s) => s.url)].filter(
    (s): s is string => !!s && /^https:\/\//.test(s) && !/youtube\.com\/watch/.test(s),
  );
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollegeOrUniversity",
        "@id": url + "#institution",
        name: u.name,
        ...(u.short_name ? { alternateName: u.short_name } : {}),
        url: u.website || url,
        mainEntityOfPage: url,
        ...(u.description ? { description: u.description } : {}),
        ...(u.founded_year ? { foundingDate: String(u.founded_year) } : {}),
        ...(u.logo_url ? { logo: u.logo_url } : {}),
        ...(image ? { image: absoluteURL(image.url) } : {}),
        ...(sameAs.length ? { sameAs } : {}),
        address: {
          "@type": "PostalAddress",
          ...(u.city ? { addressLocality: u.city } : {}),
          addressCountry: u.country_code,
        },
        ...(u.latitude != null && u.longitude != null
          ? { geo: { "@type": "GeoCoordinates", latitude: u.latitude, longitude: u.longitude } }
          : {}),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Universities", item: absoluteURL("/universities") },
          ...(countries[u.country_code]
            ? [{ "@type": "ListItem", position: 2, name: countries[u.country_code], item: absoluteURL(`/universities?country=${u.country_code}`) }]
            : []),
          { "@type": "ListItem", position: countries[u.country_code] ? 3 : 2, name: u.name, item: url },
        ],
      },
    ],
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLD(data)} />
      <UniversityPage key={u.slug} slug={u.slug} initialUniversity={u} />
    </>
  );
}
