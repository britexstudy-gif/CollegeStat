import type { Metadata } from "next";
import { notFound } from "next/navigation";
import UniversityPage from "@/pages-ui/university";
import { publicUniversity } from "@/server/university";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const u = await publicUniversity((await params).slug);
  if (!u) return { title: "University not found", robots: { index: false } };
  const description = `Research ${u.name} in ${u.city || u.country_code}: sourced admissions, tuition, programs, faculty, and student outcomes.`;
  return {
    title: u.name,
    description,
    openGraph: {
      title: u.name + " | CollegeStat",
      description,
      type: "website",
      ...(u.media[0]
        ? { images: [{ url: u.media[0].url, alt: u.media[0].alt }] }
        : {}),
    },
  };
}
export default async function Page({ params }: Props) {
  const u = await publicUniversity((await params).slug);
  if (!u) notFound();
  const data = {
    "@context": "https://schema.org",
    "@type": "CollegeOrUniversity",
    name: u.name,
    url: u.website,
    address: {
      "@type": "PostalAddress",
      addressLocality: u.city,
      addressCountry: u.country_code,
    },
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(data).replace(/</g, "\\u003c"),
        }}
      />
      <UniversityPage key={u.slug} slug={u.slug} initialUniversity={u} />
    </>
  );
}
