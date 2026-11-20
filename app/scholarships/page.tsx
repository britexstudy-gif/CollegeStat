import type { Metadata } from "next";
import { ScholarshipsDirectory } from "@/components/college/scholarships-directory";
import { JsonLd } from "@/components/seo/json-ld";
import { buildBreadcrumbJsonLd, buildItemListJsonLd } from "@/lib/seo/json-ld";
import { pageMetadata } from "@/lib/seo/metadata";
import { allScholarships } from "@/lib/scholarships-load";
import { CENTRAL_ASIA, sortScholarships } from "@/lib/scholarships-data";

export const metadata: Metadata = pageMetadata({
  title: "Scholarships for international students",
  description:
    "Scholarships for students from Uzbekistan, Kazakhstan, Kyrgyzstan and Tajikistan: what each award covers, who can apply, how to get it and the deadline, with the official link and the date we checked it.",
  path: "/scholarships",
});

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 80) : undefined);

export default async function ScholarshipsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const q = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const items = sortScholarships(allScholarships, today).map((s) => ({
    slug: s.slug,
    name: s.name,
    provider: s.provider,
    covers: s.covers,
    funding: s.funding,
    country: s.country,
    level: s.level,
    deadline: s.deadline,
    timeline: s.timeline,
    openToAll: s.openToAll,
    eligibleCodes: s.eligibleCodes,
    amountHeadline: s.amountHeadline,
    image: s.image,
    undergrad: s.undergrad,
    exchange: s.exchange,
    applicationUrl: s.applicationUrl,
  }));
  const nationality = one(q.nationality)?.toUpperCase();
  return (
    <div className="public-page-shell">
      <JsonLd
        data={[
          buildBreadcrumbJsonLd([{ name: "Home", path: "/" }, { name: "Scholarships", path: "/scholarships" }]),
          buildItemListJsonLd("Scholarships", items.map((s) => ({ name: s.name, path: "/scholarships/" + s.slug }))),
        ]}
      />
      <ScholarshipsDirectory
        items={items}
        today={today}
        initial={{
          q: one(q.q),
          country: one(q.country)?.toUpperCase(),
          level: one(q.level) === undefined ? undefined : one(q.level) === "all" ? "" : one(q.level),
          month: Number(one(q.month)) || undefined,
          funding: one(q.funding),
          ca: one(q.ca) === "1" || undefined,
          soon: one(q.soon) === "1" || undefined,
          nationality: (CENTRAL_ASIA as readonly string[]).includes(nationality ?? "") ? nationality : undefined,
        }}
      />
    </div>
  );
}
