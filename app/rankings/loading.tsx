import { PageSkeleton } from "@/components/college/page-skeleton";

export default function Loading() {
  return (
    <div className="public-page-shell">
      <PageSkeleton variant="table" label="Loading rankings…" />
    </div>
  );
}
