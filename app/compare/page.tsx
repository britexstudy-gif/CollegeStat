import Compare from "@/pages-ui/compare";
import { publicUniversities } from "@/server/university";
import { pageMetadata } from "@/lib/seo";
// Every ?ids= selection canonicalises to the one comparison tool page.
export const metadata = pageMetadata({
  title: "Compare universities side by side",
  description: "Compare universities side by side on tuition, acceptance rates, test scores, rankings, programs, and scholarships, each with its source.",
  path: "/compare",
});
export default async function ComparisonPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const ids = typeof params.ids === "string" ? params.ids.split(",") : [];
  let initialUniversities: Awaited<ReturnType<typeof publicUniversities>> = [];
  let initialError = "";
  try {
    initialUniversities = await publicUniversities(ids);
  } catch {
    initialError =
      "Comparison could not be loaded. Your selection is kept; try again.";
  }
  return (
    <Compare
      initialUniversities={initialUniversities}
      initialError={initialError}
    />
  );
}
