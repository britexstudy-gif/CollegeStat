import Compare from "@/pages-ui/compare";
import { publicUniversities } from "@/server/university";
export const metadata = { title: "Compare universities | CollegeStat" };
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
