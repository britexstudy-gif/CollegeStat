import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ScholarshipDetail } from "@/components/college/scholarship-detail";
import { allScholarships, getScholarship } from "@/lib/scholarships-load";
import { relatedScholarships } from "@/lib/scholarships-data";
import { JsonLd } from "@/components/seo/json-ld";
import { buildBreadcrumbJsonLd, buildScholarshipJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";

export const generateStaticParams = () => allScholarships.map((s) => ({ slug: s.slug }));

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = getScholarship((await params).slug);
  if (!s) return { title: "Scholarship not found" };
  const text = [s.amountHeadline, s.covers ?? s.description].filter(Boolean).join(". ");
  return pageMetadata({
    title: s.provider && !s.name.includes(s.provider) ? `${s.name} (${s.provider})` : s.name,
    description: text.length > 155 ? text.slice(0, 152).trimEnd() + "..." : text || `${s.name}: eligibility, deadline and how to apply.`,
    path: "/scholarships/" + s.slug,
  });
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const s = getScholarship(slug);
  if (!s) notFound();
  // Retired duplicate slugs point at the one page that remains.
  if (s.slug !== slug) redirect("/scholarships/" + s.slug);
  return (
    <div className="public-page-shell">
      <ScholarshipDetail
        jsonLd={
          <JsonLd
            data={[
              buildScholarshipJsonLd(s),
              buildBreadcrumbJsonLd([
                { name: "Home", path: "/" },
                { name: "Scholarships", path: "/scholarships" },
                { name: s.name, path: "/scholarships/" + s.slug },
              ]),
            ]}
          />
        }
        s={s} related={relatedScholarships(allScholarships, s)} today={new Date().toISOString().slice(0, 10)} />
    </div>
  );
}
