import { Skeleton } from "@/components/ui/skeleton";

/** Quiet placeholder shown while a route's server data streams in (loading.tsx).
 * Grey blocks only, in the page's own width, so the swap to content is calm. */
export function PageSkeleton({
  variant = "list",
  label = "Loading…",
}: {
  variant?: "list" | "table" | "profile";
  label?: string;
}) {
  return (
    <div
      className="mx-auto w-full max-w-[1200px] pb-24 pt-6 md:pt-10"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">{label}</span>
      <Skeleton className="h-10 w-2/3 max-w-md md:h-12" />
      {variant === "profile" ? (
        <>
          <Skeleton className="mt-3 h-4 w-48" />
          <Skeleton className="mt-8 h-[320px] w-full rounded-xl" />
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        </>
      ) : (
        <>
          <Skeleton className="mt-6 h-12 w-full rounded-full" />
          {variant === "table" ? (
            <div className="mt-8 grid gap-2">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-40 rounded-xl" />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
