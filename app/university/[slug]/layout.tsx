import { notFound } from "next/navigation";
import { publicUniversityForPage } from "@/server/university";
import { skipEdgeCache } from "@/server/edge-cache";

/** Resolve existence outside loading.tsx before a successful shell can stream. */
export default async function UniversityLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  let university;
  try {
    university = await publicUniversityForPage((await params).slug);
  } catch {
    // The page's existing error boundary handles availability failures. A
    // failed catalogue request must never be presented as a missing school.
    // That error page is never edge-cached.
    skipEdgeCache();
    return children;
  }
  if (!university) notFound();
  return children;
}
