import current from "@/data/published/scholarships-current.json";
import researched from "@/data/published/scholarships-researched.json";
import overlay from "@/data/review/content-scholarships-nov15.json";
import { mergeScholarships, type Raw, type Scholarship, type ScholarshipOverlay } from "./scholarships-data";

// import.meta.glob is compiled away by Vite; plain Node (tests) has no reviewed files to read.
// The glob also matches nothing until the review file exists.
const vite = !!(import.meta as { env?: unknown }).env;
const reviewedFiles = vite
  ? (import.meta.glob("../data/review/scholarships-nov14.json", { eager: true, import: "default" }) as Record<string, unknown>)
  : {};

function reviewedRecords(): Raw[] {
  return Object.values(reviewedFiles).flatMap((file) => {
    const f = file as { records?: Raw[] } | Raw[];
    return Array.isArray(f) ? f : (f.records ?? []);
  });
}

/** Published scholarships plus reviewed ones that are verified. */
export const allScholarships: Scholarship[] = mergeScholarships(
  [current as unknown as Raw[], (researched as { records: Raw[] }).records],
  reviewedRecords(),
  overlay as unknown as ScholarshipOverlay,
);

const aliases = (overlay as ScholarshipOverlay).aliases ?? {};
/** Finds a scholarship by its slug or a retired duplicate slug. */
export const getScholarship = (slug: string) => {
  const canonical = aliases[slug] ?? slug;
  return allScholarships.find((s) => s.slug === canonical);
};
