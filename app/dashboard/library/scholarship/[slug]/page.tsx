import { notFound } from "next/navigation";
import { ScholarshipDetail } from "@/components/college/scholarship-detail";
import { getScholarship, allScholarships } from "@/lib/scholarships-load";
import { relatedScholarships } from "@/lib/scholarships-data";

/** The workspace shows the same scholarship page as the public site. */
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const s = getScholarship((await params).slug);
  if (!s) notFound();
  return <ScholarshipDetail s={s} related={relatedScholarships(allScholarships, s)} today={new Date().toISOString().slice(0, 10)} />;
}
