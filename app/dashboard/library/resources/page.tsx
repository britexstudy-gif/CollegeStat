import Resources from "@/pages-ui/resources";
import { admissionPlannerSection } from "@/lib/resource-library-state";

// Private workspace tools remain available; public Resources now leads to Articles.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const university =
    typeof query.university === "string" &&
    /^[a-z0-9-]{1,200}$/.test(query.university)
      ? query.university
      : "";
  return (
    <Resources
      section={admissionPlannerSection(query.section)}
      universitySlug={university}
    />
  );
}
