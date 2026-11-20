import Compare from "@/pages-ui/compare";
import { pageMetadata } from "@/lib/seo/metadata";
import { publicUniversities } from "@/server/university";
import { skipEdgeCache } from "@/server/edge-cache";
export const metadata = pageMetadata({
  title: "Compare universities side by side",
  description:
    "Put up to four universities next to each other: rankings, tuition, admission figures and requirements, each with its source.",
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
    // The retry state is served to this visitor only, never edge-cached.
    skipEdgeCache();
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
